#include <iostream>
#include <vector>
#include <chrono>
#include <numeric>
#include <algorithm>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <map>
#include <cmath>

#include "../include/Scheduler.h"
#include "../include/Models.h"

// for test algorithm on benchmark instances (LA01 -> LA20)
std::map<std::string, int> bks_map = {
    {"la01", 666}, {"la02", 655}, {"la03", 597}, {"la04", 590}, {"la05", 593}, // 10x5
    {"la06", 926}, {"la07", 890}, {"la08", 863}, {"la09", 951}, {"la10", 958}, // 15x5
    {"la11", 1222}, {"la12", 1039}, {"la13", 1150}, {"la14", 1292}, {"la15", 1207}, // 20x5
    {"la16", 945}, {"la17", 784}, {"la18", 848}, {"la19", 842}, {"la20", 902}, // 10x10
};

std::vector<Operation> readJSSPInstance(const std::string& filepath) {
    std::vector<Operation> op;
    std::ifstream file(filepath);
    
    if (!file.is_open()) {
        std::cerr << "Error: cannot open file: " << filepath << std::endl;
        return op; 
    }

    int numJ, numM;
    file >> numJ >> numM;

    for (int i = 0; i < numJ; ++i) {
        for (int j = 0; j < numM; ++j) {
            int mID, pTime;
            file >> mID >> pTime;
            
            Operation currOp;
            currOp.orderId = i + 1;
            currOp.machineId = mID + 1;
            currOp.stepSequence = j + 1;
            currOp.processingTimeMinutes = pTime;
            
            // --- test data for benchmark instances ---
            currOp.setupTimeMinutes = 0;
            currOp.priority = 1;
            currOp.dueDateMinutes = 9999999;

            op.push_back(currOp);
        }
    }
    file.close();
    return op;
}

int main() {
    const int NUM_RUNS = 50;
    
    std::string data_dir = "data/"; 

    std::ofstream outfile("benchmark_la_results.csv");
    if (!outfile.is_open()) {
        std::cerr << "Error: cannot open output file!" << std::endl;
        return 1;
    }

    // Header
    outfile << "Instance,Num_Runs,BKS,Best_Cmax,Worst_Cmax,Avg_Cmax,Gap_Percent,Avg_Time_ms,Avg_Gap_Percent,Runs_At_BKS\n";
    
    std::cout << "========== STARTING BENCHMARK LA01 -> LA20 ==========\n";
    std::cout << std::left << std::setw(10) << "Instance" 
              << std::setw(10) << "BKS" 
              << std::setw(10) << "Best" 
              << std::setw(10) << "Gap(%)" 
              << std::setw(12) << "AvgGap(%)" 
              << std::setw(10) << "AtBKS" 
              << std::setw(15) << "Avg Time(ms)" << "\n";
    std::cout << "----------------------------------------------------------------------\n";

    for (int i = 1; i <= 20; ++i) {
        std::stringstream ss;
        ss << "la" << std::setw(2) << std::setfill('0') << i;
        std::string instance_name = ss.str();
        std::string filepath = data_dir + instance_name + ".txt";

        std::vector<Operation> op = readJSSPInstance(filepath);
        if (op.empty()) continue; 

        int bks = bks_map[instance_name];
        std::vector<int> cmax_records;
        std::vector<double> time_records;

        for (int run = 0; run < NUM_RUNS; ++run) {
            SchedulerConfig config;
            config.seed = 1000 + run; // fixed seeds: anyone can reproduce the table
            JobShopScheduler scheduler(config);
            
            auto start = std::chrono::high_resolution_clock::now();
            std::vector<ScheduledTask> results = scheduler.schedule(op);
            auto end = std::chrono::high_resolution_clock::now();
            
            std::chrono::duration<double, std::milli> duration = end - start;

            // C_max
            int makespan = 0;
            for (const auto& task : results) {
                if (task.endTime > makespan) {
                    makespan = task.endTime;
                }
            }
            cmax_records.push_back(makespan);
            time_records.push_back(duration.count());
        }

        int best_cmax = *std::min_element(cmax_records.begin(), cmax_records.end());
        int worst_cmax = *std::max_element(cmax_records.begin(), cmax_records.end());
        double avg_cmax = std::accumulate(cmax_records.begin(), cmax_records.end(), 0.0) / NUM_RUNS;
        double avg_time = std::accumulate(time_records.begin(), time_records.end(), 0.0) / NUM_RUNS;
        
        // %gap lower is better
        double gap_percent = ((double)(best_cmax - bks) / bks) * 100.0;
        double avg_gap_percent = ((avg_cmax - bks) / bks) * 100.0;
        int runs_at_bks = (int)std::count_if(cmax_records.begin(), cmax_records.end(), [bks](int c) { return c <= bks; });

        std::cout << std::left << std::setw(10) << instance_name 
                  << std::setw(10) << bks 
                  << std::setw(10) << best_cmax 
                  << std::fixed << std::setprecision(2) << std::setw(10) << gap_percent 
                  << std::setw(12) << avg_gap_percent 
                  << std::setw(10) << (std::to_string(runs_at_bks) + "/" + std::to_string(NUM_RUNS)) 
                  << std::setw(15) << avg_time << "\n";

        outfile << instance_name << ","
                << NUM_RUNS << ","
                << bks << ","
                << best_cmax << ","
                << worst_cmax << ","
                << avg_cmax << ","
                << gap_percent << ","
                << avg_time << ","
                << avg_gap_percent << ","
                << runs_at_bks << "\n";
    }

    outfile.close();
    std::cout << "----------------------------------------------------------------------\n";
    std::cout << "Done! check result in file path 'benchmark_la_results.csv'\n";

    return 0;
}