UPDATE runs
SET hardware_label = 'NVIDIA RTX 4090 24GB', gpu = 'NVIDIA RTX 4090', gpu_memory_gb = 24.0,
    is_remote = 1, remote_host = 'localhost', endpoint = 'http://localhost:11435',
    cpu = '', os = 'remote', machine_id = 'remote:localhost'
WHERE run_id = '20260512-201425-qwen3-8b-local-ollama';
