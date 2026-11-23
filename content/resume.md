---
# The resume PDF this file was transcribed from. When public/Edward-Chen-Resume.pdf
# changes, update this file to say what the new PDF says and set the new hash
# (shasum -a 256 public/Edward-Chen-Resume.pdf); the build fails until both match.
pdf: /Edward-Chen-Resume.pdf
pdf_sha256: 2a2798e3d18fe6693d12e68b813c8c234f67041b4ae87811a0f7192f06f7646f
---

# Edward Chen — Resume

San Ramon, CA · echen1246@gmail.com
[linkedin.com/in/eddie17](https://linkedin.com/in/eddie17) · [github.com/0x3ddie](https://github.com/0x3ddie) · [eddiechen.xyz](https://eddiechen.xyz/)

Canonical PDF: https://eddiechen.xyz/Edward-Chen-Resume.pdf

---

## Education

**Arizona State University** — B.S. Data Science, B.A. Business Administration
Expected December 2027 · GPA: 3.7 — Dean’s List

Coursework: Operating Systems, Data Structures, Deep Learning, Machine Learning, Computer Vision, Linux, Lin. Algebra

---

## Skills

- **Languages:** Python, C, C++, SQL, Java, TypeScript, MATLAB
- **AI/ML:** PyTorch, JAX, Hugging Face Transformers, vLLM/SGLang, ONNX Runtime, FAISS, PPO/GRPO, llama.cpp
- **Inference/GPU:** CUDA/Triton, Quantization, KV-Cache Compression, FlashAttention
- **Tools:** Docker, Linux, Snowflake, FastAPI, Git, GitHub Actions, GitLab CI, Flutter, Hermes Harness, AWS

---

## Open Source (merged)

- **PyTorch:** Fixed export-state detection ([#176499](https://github.com/pytorch/pytorch/pull/176499)); added bytearray methods to Dynamo ([#204844](https://github.com/pytorch/pytorch/pull/204844)); Muon docs ([#177262](https://github.com/pytorch/pytorch/pull/177262))
- **llama.cpp:** fixed server output_config.effort handling ([#32321](https://github.com/ggml-org/llama.cpp/pull/32321)); fixed crash from end-of-sequence token error ([#32377](https://github.com/ggml-org/llama.cpp/pull/32377))
- **Triton:** added fp16/bf16 constant support ([#12778](https://github.com/triton-lang/triton/pull/12778))

---

## Experience

### Age of Learning — Data Engineer Intern
*June 2026 – August 2026 · Los Angeles, CA*

- Engineered a Snowflake SQL feature pipeline (48 student engagement and skill-mastery features) powering a personalized activity recommender that raised post-lesson continuation by 14%.
- Built an agentic monitoring system for marketing reports that uncovered $4.35M in misattributed spend. Saved ~$113K in annual AI and data platform costs by removing redundant query jobs and software subscriptions.
- Built an internal AI platform to automate GitLab code reviews and to trace failures to their source across ~200 tables and ~4,000 data models.

### [mymelo.org](https://mymelo.org) — Co-Founder, Software Engineer
*April 2025 – June 2026 · San Francisco, CA*

- Trained the melanoma classifier (EfficientNet-B0, 30K dermoscopy images) to 95% recall at 90% specificity on a held-out split.
- Shipped it in a patient and provider app that won 2nd at Caltech's HackTech 2025 and was trialed at UCSD-affiliated dermatology; ran 50+ user interviews.
- Rebuilt image storage and edge compression on AWS S3/Lambda after a launch-day storage failure, cutting median scan-preview load from 5s to 1s and image size by 80%.

---

## Projects

### local-turboquant — PyTorch, Modal, transformers

Repo: [github.com/0x3ddie/local-turboquant](https://github.com/0x3ddie/local-turboquant)

- Implemented Google Research's TurboQuant (ICLR 2026) as a pip-installable library for HF Transformers: 4-bit KV-cache quantization cuts cache memory by 74% on Llama 3.1-8B (9.5 GB to 2.5 GB at 73K context) at 0.995 cosine similarity.
- Wrote a fused Triton kernel that computes attention directly on bit-packed keys and values with no decompression, at 2.25x baseline decode latency.

### RunescapeRL — RLHF, Python, C, CUDA, PPO, LSTM

Repo: [github.com/0x3ddie/runescape-agent](https://github.com/0x3ddie/runescape-agent)

- Wrote a game simulator in C around 100x faster than its Python reference and bit-exact to it over 61M game ticks; added CUDA graphs to the PPO update, raising training throughput 11x to ~28K decisions/s on one G4 GPU.
- Trained a recurrent PPO agent to navigate the map through clicks, chop, mine, fish and fight from game rewards on a private RuneScape server.

### murmur — ONNX Runtime, Flutter, SQLite

App: https://play.google.com/apps/testing/com.nonchalant.murmur

- Built an Android app that reads PDFs aloud with fully on-device inference, reaching initial playback in approximately three seconds during testing.
- Moved inference to a background thread through a modified Flutter/ONNX integration; connected native speech preprocessing through Dart FFI and cached sentence results in SQLite.

---

## Links

- Website: https://eddiechen.xyz/
- Projects: https://eddiechen.xyz/engineering
- Writing: https://eddiechen.xyz/writing
- GitHub: https://github.com/0x3ddie
- X / Twitter: https://twitter.com/ayocheddie
