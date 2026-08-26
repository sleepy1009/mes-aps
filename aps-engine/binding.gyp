{
  "targets": [
    {
      "target_name": "aps_engine",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "LanguageStandard": "stdcpp17"
        }
      },
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
      },
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include"
      ],
      "sources": [
        "src/Scheduler.cpp",
        "src/addon.cpp"
      ],
      "defines": [ "NAPI_CPP_EXCEPTIONS" ]
    }
  ]
}