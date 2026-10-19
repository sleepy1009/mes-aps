#include <napi.h>
#include "../include/Scheduler.h"
#include <climits>
#include <cmath>
#include <exception>
#include <string>
#include <utility>
#include <vector>

static Napi::Object statsToJs(Napi::Env env, const ScheduleStats& s) {
    Napi::Object o = Napi::Object::New(env);
    o.Set("Makespan", static_cast<double>(s.makespan));
    o.Set("TotalTardiness", static_cast<double>(s.totalTardiness));
    o.Set("PriorityPenalty", static_cast<double>(s.priorityPenalty));
    o.Set("LateOrders", static_cast<double>(s.lateOrders));
    o.Set("TotalSetupMinutes", static_cast<double>(s.totalSetupMinutes));
    o.Set("Fitness", static_cast<double>(s.fitness));
    return o;
}

// Worker for Event Loop
class SchedulerWorker : public Napi::AsyncWorker {
public:
    SchedulerWorker(Napi::Env& env, std::vector<Operation> ops, std::vector<SetupEntry> setup,
                std::vector<MachineWindow> wins, std::vector<MachineProfile> profs,
                RescheduleContext ctx,
                SchedulerConfig cfg, Napi::Promise::Deferred deferred)
    : Napi::AsyncWorker(env), inputOps(std::move(ops)), setupEntries(std::move(setup)),
      windows(std::move(wins)), profiles(std::move(profs)),
      rctx(std::move(ctx)),
      config(cfg), deferred(deferred) {}

    // single thread (no napi)
    void Execute() override {
        try {
            JobShopScheduler scheduler(config);
            results = scheduler.schedule(inputOps, setupEntries, windows, profiles, rctx);
            stats = scheduler.lastStats();
            baselines = scheduler.lastBaselines();
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("Unknown C++ error occurred during scheduling.");
        }
    }

    // Main Thread after Execute (use napi)
    // convert results to JS array of objects and resolve the promise below
    void OnOK() override {
        Napi::Env env = Env();
        Napi::Array res = Napi::Array::New(env, results.size());

        for (size_t i = 0; i < results.size(); i++) {
            Napi::Object jTask = Napi::Object::New(env);
            jTask.Set("OrderId", results[i].orderId);
            jTask.Set("MachineId", results[i].machineId);
            jTask.Set("Step", results[i].stepSequence);
            jTask.Set("StartTime", results[i].startTime);
            jTask.Set("EndTime", results[i].endTime);
            jTask.Set("SetupStart", results[i].setupStartTime);
            jTask.Set("SetupMinutes", results[i].setupMinutes);
            jTask.Set("Status", results[i].status); // 0 = newly scheduled, 1 = fixed chunk
            res.Set(i, jTask);
        }

        Napi::Array bl = Napi::Array::New(env, baselines.size());
        for (size_t i = 0; i < baselines.size(); i++) {
            Napi::Object b = Napi::Object::New(env);
            b.Set("Name", Napi::String::New(env, baselines[i].name));
            b.Set("Stats", statsToJs(env, baselines[i].stats));
            bl.Set(i, b);
        }

        Napi::Object out = Napi::Object::New(env);
        out.Set("Tasks", res);
        out.Set("Stats", statsToJs(env, stats));
        out.Set("Baselines", bl);
        deferred.Resolve(out);
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    std::vector<Operation> inputOps;
    std::vector<SetupEntry> setupEntries;
    SchedulerConfig config;
    std::vector<ScheduledTask> results;
    ScheduleStats stats;
    std::vector<BaselineResult> baselines;
    Napi::Promise::Deferred deferred;

    std::vector<MachineWindow> windows;
    std::vector<MachineProfile> profiles;
    RescheduleContext rctx;
};

static bool readInt(const Napi::Object& obj, const char* key, bool required, int defaultValue,
                    int& out, std::string& err) {
    Napi::Value v = obj.Get(key);
    if (v.IsUndefined() || v.IsNull()) {
        if (required) {
            err = std::string("missing field '") + key + "'";
            return false;
        }
        out = defaultValue;
        return true;
    }
    if (!v.IsNumber()) {
        err = std::string("field '") + key + "' must be a number";
        return false;
    }
    double d = v.As<Napi::Number>().DoubleValue();
    if (!std::isfinite(d) || d != std::floor(d) || d < INT_MIN || d > INT_MAX) {
        err = std::string("field '") + key + "' must be an integer";
        return false;
    }
    out = static_cast<int>(d);
    return true;
}

static bool readDouble(const Napi::Object& obj, const char* key, double& out, std::string& err) {
    Napi::Value v = obj.Get(key);
    if (v.IsUndefined() || v.IsNull()) return true;
    if (!v.IsNumber()) {
        err = std::string("field '") + key + "' must be a number";
        return false;
    }
    out = v.As<Napi::Number>().DoubleValue();
    return true;
}

// JS: runSchedule(operations, config?)
//   operations: [{ OrderId, MachineId, Step, Time, Priority?, ReleaseMinutes?, DueDateMinutes?, SetupTime?, FamilyId? }]
//   config:     { Seed, PopulationSize, MaxGenerations, TournamentSize, MutationRate, WeightP1, WeightP2, WeightP3, WeightSetup,
//                 SetupMatrix: [{ MachineId (-1 = default for all machines), FromFamily, ToFamily, Minutes }] }
Napi::Value RunSchedule(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "input must be an array of objects").ThrowAsJavaScriptException();
        return env.Null();
    }

    SchedulerConfig cfg;
    std::vector<SetupEntry> setupEntries;
    std::vector<MachineWindow> windows;
    std::vector<MachineProfile> profiles;
    RescheduleContext rctx;


    if (info.Length() >= 2 && info[1].IsObject()) {
        Napi::Object c = info[1].As<Napi::Object>();
        std::string err;
        int seed = 0;
        bool ok =
            readInt(c, "Seed", false, 0, seed, err) &&
            readInt(c, "PopulationSize", false, cfg.populationSize, cfg.populationSize, err) &&
            readInt(c, "MaxGenerations", false, cfg.maxGenerations, cfg.maxGenerations, err) &&
            readInt(c, "TournamentSize", false, cfg.tournamentSize, cfg.tournamentSize, err) &&
            readDouble(c, "MutationRate", cfg.mutationRate, err) &&
            readInt(c, "WeightP1", false, cfg.weightPriority1, cfg.weightPriority1, err) &&
            readInt(c, "WeightP2", false, cfg.weightPriority2, cfg.weightPriority2, err) &&
            readInt(c, "WeightP3", false, cfg.weightPriority3, cfg.weightPriority3, err) &&
            readInt(c, "WeightSetup", false, cfg.weightSetup, cfg.weightSetup, err);
        if (ok && seed < 0) {
            err = "field 'Seed' must be >= 0";
            ok = false;
        }
        if (!ok) {
            Napi::TypeError::New(env, "config: " + err).ThrowAsJavaScriptException();
            return env.Null();
        }
        cfg.seed = static_cast<unsigned int>(seed);

        Napi::Value sm = c.Get("SetupMatrix");
        if (!sm.IsUndefined() && !sm.IsNull()) {
            if (!sm.IsArray()) {
                Napi::TypeError::New(env, "config: field 'SetupMatrix' must be an array").ThrowAsJavaScriptException();
                return env.Null();
            }
            Napi::Array arr = sm.As<Napi::Array>();
            for (uint32_t i = 0; i < arr.Length(); i++) {
                Napi::Value v = arr.Get(i);
                std::string entryErr;
                if (!v.IsObject()) {
                    Napi::TypeError::New(env, "SetupMatrix #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
                    return env.Null();
                }
                Napi::Object eo = v.As<Napi::Object>();
                SetupEntry e;
                bool entryOk =
                    readInt(eo, "MachineId", true, -1, e.machineId, entryErr) &&
                    readInt(eo, "FromFamily", true, 0, e.fromFamily, entryErr) &&
                    readInt(eo, "ToFamily", true, 0, e.toFamily, entryErr) &&
                    readInt(eo, "Minutes", true, 0, e.minutes, entryErr);
                if (!entryOk) {
                    Napi::TypeError::New(env, "SetupMatrix #" + std::to_string(i) + ": " + entryErr).ThrowAsJavaScriptException();
                    return env.Null();
                }
                setupEntries.push_back(e);
            }
        }

        // === parse Windows ===
        Napi::Value wv = c.Get("Windows");
        if (!wv.IsUndefined() && !wv.IsNull()) {
            if (!wv.IsArray()) {
                Napi::TypeError::New(env, "config: field 'Windows' must be an array").ThrowAsJavaScriptException();
                return env.Null();
            }
            Napi::Array warr = wv.As<Napi::Array>();
            for (uint32_t i = 0; i < warr.Length(); i++) {
                if (!warr.Get(i).IsObject()) {
                    Napi::TypeError::New(env, "Windows #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
                    return env.Null();
                }
                Napi::Object wo = warr.Get(i).As<Napi::Object>();
                MachineWindow w;
                std::string werr;
                bool wok = readInt(wo, "MachineId", true, -1, w.machineId, werr) &&
                        readInt(wo, "Start",    true,  0, w.startMinutes, werr) &&
                        readInt(wo, "End",      true,  0, w.endMinutes, werr) &&
                        readInt(wo, "Type",     false, 0, w.type, werr);
                if (!wok) {
                    Napi::TypeError::New(env, "Windows #" + std::to_string(i) + ": " + werr).ThrowAsJavaScriptException();
                    return env.Null();
                }
                windows.push_back(w);
            }
        }

        // === parse Efficiency profiles ===
        Napi::Value pv = c.Get("Efficiency");
        if (!pv.IsUndefined() && !pv.IsNull()) {
            if (!pv.IsArray()) {
                Napi::TypeError::New(env, "config: field 'Efficiency' must be an array").ThrowAsJavaScriptException();
                return env.Null();
            }
            Napi::Array parr = pv.As<Napi::Array>();
            for (uint32_t i = 0; i < parr.Length(); i++) {
                if (!parr.Get(i).IsObject()) {
                    Napi::TypeError::New(env, "Efficiency #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
                    return env.Null();
                }
                Napi::Object po = parr.Get(i).As<Napi::Object>();
                MachineProfile p;
                std::string perr;
                bool pok = readInt(po, "MachineId", true, -1, p.machineId, perr) &&
                        readDouble(po, "Rate", p.efficiencyRate, perr);
                if (pok && !(p.efficiencyRate > 0.0 && p.efficiencyRate <= 1.0)) {
                    perr = "field 'Rate' must be in (0, 1]";
                    pok = false;
                }
                if (!pok) {
                    Napi::TypeError::New(env, "Efficiency #" + std::to_string(i) + ": " + perr).ThrowAsJavaScriptException();
                    return env.Null();
                }
                profiles.push_back(p);
            }
        }

        // === parse reschedule context ===
        Napi::Value rv = c.Get("Reschedule");
        if (!rv.IsUndefined() && !rv.IsNull()) {
            if (!rv.IsObject()) {
                Napi::TypeError::New(env, "config: field 'Reschedule' must be an object").ThrowAsJavaScriptException();
                return env.Null();
            }
            Napi::Object ro = rv.As<Napi::Object>();
            std::string rerr;
            if (!readInt(ro, "NowMinutes", false, 0, rctx.nowMinutes, rerr) || rctx.nowMinutes < 0) {
                Napi::TypeError::New(env, "Reschedule: field 'NowMinutes' must be an integer >= 0").ThrowAsJavaScriptException();
                return env.Null();
            }
            Napi::Value fv = ro.Get("FixedTasks");
            if (!fv.IsUndefined() && !fv.IsNull()) {
                if (!fv.IsArray()) {
                    Napi::TypeError::New(env, "Reschedule: field 'FixedTasks' must be an array").ThrowAsJavaScriptException();
                    return env.Null();
                }
                Napi::Array fa = fv.As<Napi::Array>();
                for (uint32_t i = 0; i < fa.Length(); i++) {
                    if (!fa.Get(i).IsObject()) {
                        Napi::TypeError::New(env, "Reschedule: FixedTasks #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    Napi::Object fo = fa.Get(i).As<Napi::Object>();
                    FixedTask ft;
                    bool fok = readInt(fo, "OrderId",   true, -1, ft.orderId, rerr) &&
                            readInt(fo, "MachineId", true, -1, ft.machineId, rerr) &&
                            readInt(fo, "Step",      true, -1, ft.stepSequence, rerr) &&
                            readInt(fo, "Start",     true,  0, ft.startMinutes, rerr) &&
                            readInt(fo, "End",       true,  0, ft.endMinutes, rerr) &&
                            readInt(fo, "Kind",      false, 0, ft.kind, rerr);
                    if (!fok) {
                        Napi::TypeError::New(env, "Reschedule: FixedTasks #" + std::to_string(i) + ": " + rerr).ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    rctx.fixedTasks.push_back(ft);
                }
            }
            Napi::Value gv = ro.Get("Progress");
            if (!gv.IsUndefined() && !gv.IsNull()) {
                if (!gv.IsArray()) {
                    Napi::TypeError::New(env, "Reschedule: field 'Progress' must be an array").ThrowAsJavaScriptException();
                    return env.Null();
                }
                Napi::Array ga = gv.As<Napi::Array>();
                for (uint32_t i = 0; i < ga.Length(); i++) {
                    if (!ga.Get(i).IsObject()) {
                        Napi::TypeError::New(env, "Reschedule: Progress #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    Napi::Object go = ga.Get(i).As<Napi::Object>();
                    OrderProgress pr;
                    bool gok = readInt(go, "OrderId", true, -1, pr.orderId, rerr) &&
                            readInt(go, "DoneSteps", true, 0, pr.doneSteps, rerr);
                    if (!gok) {
                        Napi::TypeError::New(env, "Reschedule: Progress #" + std::to_string(i) + ": " + rerr).ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    rctx.progress.push_back(pr);
                }
            }
            Napi::Value lv = ro.Get("LastOrder");
            if (!lv.IsUndefined() && !lv.IsNull()) {
                if (!lv.IsArray()) {
                    Napi::TypeError::New(env, "Reschedule: field 'LastOrder' must be an array").ThrowAsJavaScriptException();
                    return env.Null();
                }
                Napi::Array la = lv.As<Napi::Array>();
                for (uint32_t i = 0; i < la.Length(); i++) {
                    if (!la.Get(i).IsObject()) {
                        Napi::TypeError::New(env, "Reschedule: LastOrder #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    Napi::Object lo = la.Get(i).As<Napi::Object>();
                    MachineLastOrder mlo;
                    bool lok = readInt(lo, "MachineId", true, -1, mlo.machineId, rerr) &&
                            readInt(lo, "OrderId", true, -1, mlo.orderId, rerr);
                    if (!lok) {
                        Napi::TypeError::New(env, "Reschedule: LastOrder #" + std::to_string(i) + ": " + rerr).ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    rctx.lastOrderInit.push_back(mlo);
                }
            }
        }

    }

    // get data from JS then convert to C++ vector<Operation>
    Napi::Array jsArray = info[0].As<Napi::Array>();
    uint32_t length = jsArray.Length();
    std::vector<Operation> operations;
    operations.reserve(length);

    for (uint32_t i = 0; i < length; i++) {
        Napi::Value val = jsArray.Get(i);
        std::string err;

        if (!val.IsObject()) {
            Napi::TypeError::New(env, "Operation #" + std::to_string(i) + ": must be an object").ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Object obj = val.As<Napi::Object>();

        Operation op;
        bool ok =
            readInt(obj, "OrderId", true, 0, op.orderId, err) &&
            readInt(obj, "MachineId", true, 0, op.machineId, err) &&
            readInt(obj, "Step", true, 0, op.stepSequence, err) &&
            readInt(obj, "Time", true, 0, op.processingTimeMinutes, err) &&
            readInt(obj, "Priority", false, 1, op.priority, err) &&
            readInt(obj, "ReleaseMinutes", false, 0, op.releaseTimeMinutes, err) &&
            readInt(obj, "DueDateMinutes", false, 999999, op.dueDateMinutes, err) &&
            readInt(obj, "SetupTime", false, 0, op.setupTimeMinutes, err) &&
            readInt(obj, "FamilyId", false, 0, op.familyId, err);
        {
            int asMachineMinutes = 0;
            ok = ok && readInt(obj, "TimeIsMachineMinutes", false, 0, asMachineMinutes, err);
            op.timeIsMachineMinutes = (asMachineMinutes != 0);
        }

        if (!ok) {
            Napi::TypeError::New(env, "Operation #" + std::to_string(i) + ": " + err).ThrowAsJavaScriptException();
            return env.Null();
        }
        operations.push_back(op);
    }

    // Create a promise and queue the worker (work in another thread, nodejs still free)
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    SchedulerWorker* worker = new SchedulerWorker(env, std::move(operations), std::move(setupEntries),
                                               std::move(windows), std::move(profiles), rctx, cfg, deferred);
    worker->Queue();

    return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("runSchedule", Napi::Function::New(env, RunSchedule));
    return exports;
}

NODE_API_MODULE(aps_engine, Init)