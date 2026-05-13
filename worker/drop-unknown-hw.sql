DELETE FROM runs
WHERE (hardware_label IS NULL OR hardware_label = '')
  AND (gpu IS NULL OR gpu = '')
  AND (cpu IS NULL OR cpu = '');
