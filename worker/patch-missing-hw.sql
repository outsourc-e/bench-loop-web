UPDATE runs
SET hardware_label = 'NVIDIA RTX 4090 24GB',
    gpu = 'NVIDIA RTX 4090',
    gpu_memory_gb = 24.0
WHERE endpoint = 'http://localhost:11435'
  AND (hardware_label IS NULL OR hardware_label = '');
