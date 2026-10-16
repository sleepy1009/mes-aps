#include <napi.h>
#include "../include/Scheduler.h"
#include <climits>
#include <cmath>
#include <exception>
#include <string>
#include <utility>
#include <vector>

// Worker for Event Loop
class SchedulerWorker : public Napi::AsyncWorker {
public:
    SchedulerWorker(Napi::Env& env, std::vector<Operation> ops, SchedulerConfig cfg, Napi::Promise::Deferred deferred)
        : Napi::AsyncWorker(env), inputOps(std::move(ops)), config(cfg), deferred(deferred) {}

    // single thread (no napi)
    void Execute() override {
        try {
            JobShopScheduler scheduler(config);
            results = scheduler.schedule(inputOps);
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
            res.Set(i, jTask);
        }

        deferred.Resolve(res);
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    std::vector<Operation> inputOps;
    SchedulerConfig config;
    std::vector<ScheduledTask> results;
    Napi::Promise::Deferred deferred;
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
//   operations: [{ OrderId, MachineId, Step, Time, Priority?, DueDateMinutes?, SetupTime? }]
//   config:     { Seed, PopulationSize, MaxGenerations, TournamentSize, MutationRate, WeightP1, WeightP2, WeightP3 }
Napi::Value RunSchedule(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "input must be an array of objects").ThrowAsJavaScriptException();
        return env.Null();
    }

    SchedulerConfig cfg;
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
            readInt(c, "WeightP3", false, cfg.weightPriority3, cfg.weightPriority3, err);
        if (ok && seed < 0) {
            err = "field 'Seed' must be >= 0";
            ok = false;
        }
        if (!ok) {
            Napi::TypeError::New(env, "config: " + err).ThrowAsJavaScriptException();
            return env.Null();
        }
        cfg.seed = static_cast<unsigned int>(seed);
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
            readInt(obj, "DueDateMinutes", false, 999999, op.dueDateMinutes, err) &&
            readInt(obj, "SetupTime", false, 0, op.setupTimeMinutes, err);

        if (!ok) {
            Napi::TypeError::New(env, "Operation #" + std::to_string(i) + ": " + err).ThrowAsJavaScriptException();
            return env.Null();
        }
        operations.push_back(op);
    }

    // Create a promise and queue the worker (work in another thread, nodejs still free)
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    SchedulerWorker* worker = new SchedulerWorker(env, std::move(operations), cfg, deferred);
    worker->Queue();

    return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("runSchedule", Napi::Function::New(env, RunSchedule));
    return exports;
}

NODE_API_MODULE(aps_engine, Init)