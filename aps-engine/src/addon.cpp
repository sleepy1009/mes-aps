#include <napi.h>
#include "../include/Scheduler.h"
#include <vector>
#include <exception>

// Worker for Event Loop
class SchedulerWorker : public Napi::AsyncWorker {
public:
    SchedulerWorker(Napi::Env& env, std::vector<Operation> ops, Napi::Promise::Deferred deferred)
        : Napi::AsyncWorker(env), inputOps(ops), deferred(deferred) {}

    // single thread (no napi)
    void Execute() override {
        try {
            JobShopScheduler scheduler;
            results = scheduler.schedule(inputOps);
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            SetError("Unknown C++ error occurred during scheduling.");
        }
    }

    // Main Thread after Execute (use napi)
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
    std::vector<ScheduledTask> results;
    Napi::Promise::Deferred deferred;
};

// JS function exposed to Node.js
Napi::Value RunSchedule(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "input must be an array of objects").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array jsArray = info[0].As<Napi::Array>();
    uint32_t length = jsArray.Length();
    std::vector<Operation> operations;
    operations.reserve(length);

    for (uint32_t i = 0; i < length; i++) {
        Napi::Value val = jsArray.Get(i);
        if (!val.IsObject()) continue;
        Napi::Object obj = val.As<Napi::Object>();

        Operation op;
        op.orderId = obj.Get("OrderId").As<Napi::Number>().Int32Value();
        op.machineId = obj.Get("MachineId").As<Napi::Number>().Int32Value();
        op.stepSequence = obj.Get("Step").As<Napi::Number>().Int32Value();
        op.processingTimeMinutes = obj.Get("Time").As<Napi::Number>().Int32Value();
        
        op.priority = obj.Has("Priority") ? obj.Get("Priority").As<Napi::Number>().Int32Value() : 1;
        op.dueDateMinutes = obj.Has("DueDateMinutes") ? obj.Get("DueDateMinutes").As<Napi::Number>().Int32Value() : 999999;
        op.setupTimeMinutes = obj.Has("SetupTime") ? obj.Get("SetupTime").As<Napi::Number>().Int32Value() : 0;
        
        operations.push_back(op);
    }

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    
    // 
    SchedulerWorker* worker = new SchedulerWorker(env, operations, deferred);
    worker->Queue();

    return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("runSchedule", Napi::Function::New(env, RunSchedule));
    return exports;
}

NODE_API_MODULE(aps_engine, Init)