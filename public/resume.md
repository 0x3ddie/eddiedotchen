# Edward Chen — Resume

San Francisco, California · 925-725-5285 · echen1246@gmail.com
GitHub: https://github.com/0x3ddie · Portfolio: https://eddiechen.xyz/

Canonical PDF: https://eddiechen.xyz/Edward-Chen-Resume.pdf

---

## Education

**Arizona State University** — August 2023 to present
BS Data Science, BA Supply Chain Management, Minor in Economics. GPA: 3.7.

Coursework: Data Structures, Operating Systems, Computer Vision, Networking, Machine Learning, Linear Algebra.

Activities: Scholars of Finance, Association for Computing Machinery.

---

## Projects

### KV-Cache Compression for Transformer Inference — `local-turboquant`
*PyTorch, Modal, Transformers, CUDA, Triton*

- Reproduced an unpublished ICLR 2026 paper from scratch and shipped it as a working library before the authors released code. One-line API, Python wrapper, and a CLI exposing per-generation savings, throughput, and freed VRAM. Benchmarked on H100s via Modal.
- Wrote a fused Triton attention kernel that runs directly on bit-packed 3-bit KV indices without decompressing to FP16, achieving ~74% KV cache memory reduction at near-lossless quality.

Repo: https://github.com/0x3ddie/local-turboquant

### Modified Transformer Architecture — `smarternano`
*PyTorch, CUDA, OpenRouter, Transformers*

- Re-engineered the nanochat architecture with custom layer depth and weight initialization, re-trained on Nvidia's Nemotron Nano dataset; the project was publicly recognized by Andrej Karpathy.
- Built a synthetic data generation pipeline via OpenRouter to align the model's personality, achieving coherence comparable to 560M parameter models.

Demo: https://space3--nanochat-serve-chat.modal.run/

### Wasm Runtime and Compiler — `silicon-JIT`
*Rust, ARM64 Assembly*

- Engineered a WebAssembly runtime in Rust that executes C/Rust programs on Apple Silicon, with a JIT compiler translating bytecode to native ARM64 machine code.
- Managed executable memory via manual `mmap`/`mprotect` syscalls for direct code generation.

### AI-Native App — `murmur`
*ONNX, Flutter, AI Engineering*

- Built and released a mobile app that converts any PDF into human-quality audio entirely on-device, achieving 3-second load-to-playback with zero server dependencies. Deployed Kokoro-82M transformer TTS on Android via ONNX Runtime, forking the runtime to isolate inference on a background thread for performance.
- Built an NLP preprocessing pipeline by cross-compiling espeak-ng and writing Dart FFI bindings for IPA phonemization, implementing token-aware batch splitting against the model's tokenizer vocab, and caching per-sentence phonemes in SQLite to eliminate redundant compute at inference time.

App: https://play.google.com/apps/testing/com.nonchalant.murmur

---

## Experience

### mymelo.org — Co-Founder, ML Engineer
*April 2025 to present*

- Trained and deployed an EfficientNet-B0 CNN on 30K dermoscopy samples achieving 95% diagnostic accuracy, serving inference via AWS Lambda with an S3-backed data pipeline.
- Built a cross-platform mobile app in Flutter with OAuth integration, conducting 50+ user interviews to iterate on UX for clinical deployment.
- Engineered a scalable data pipeline using AWS S3 and Lambda to support a high-volume image processing workflow for model inference and data archival.

### M.Y Intellectual Property — Software Engineer Intern
*May 2024 to August 2024*

- Engineered a unified patent search API aggregating USPTO, CNIPA, and EPO databases into a single query interface, reducing cross-jurisdictional research from 3 workflows to 1 and cutting attorney lookup time by 60%.
- Built a citation network parser to extract patent family relationships across 50K+ international filings, automating competitor portfolio analysis for 15+ client engagements.

---

## Skills

- **Languages:** C++, Python, Java, JavaScript, Rust, SQL.
- **Technologies:** AWS, Docker, Flutter, React, Next.js, Django, Flask, Supabase, Git, MongoDB, Vue.js, SQLite, Modal.
- **AI/ML:** PyTorch, FastAPI, ONNX Runtime, OpenCV, CUDA, vLLM, LangChain, FAISS, ANOVA, Keras, Transformers.
- **Open-source contributions:** Meta PyTorch.

---

## Links

- Website: https://eddiechen.xyz/
- Projects: https://eddiechen.xyz/engineering
- Writing: https://eddiechen.xyz/writing
- GitHub: https://github.com/0x3ddie
- X / Twitter: https://twitter.com/ayocheddie
