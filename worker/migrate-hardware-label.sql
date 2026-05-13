ALTER TABLE runs ADD COLUMN hardware_label TEXT;
UPDATE runs
SET hardware_label = 'NVIDIA RTX 4090 24GB', gpu = 'NVIDIA RTX 4090', gpu_memory_gb = 24.0
WHERE is_remote = 1 AND endpoint = 'http://localhost:11435';
