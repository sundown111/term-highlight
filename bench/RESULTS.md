# Benchmark results

Generated 2026-11-10T16:19:07.465Z by `node bench/run.mjs`.

**Hardware:** Apple M1 Pro, 10 cores, 16 GB RAM, darwin 24.6.0 arm64.

Times are wall-clock milliseconds of the synchronous call (the main thread is blocked for exactly that long). p50/p95 over the listed runs. Heap figures are Chromium-only (`performance.memory` with precise info and forced GC); other engines report n/a. Firefox and WebKit coarsen `performance.now()` (about 1 ms), so sub-millisecond values there are rough. These are single-machine measurements, not guarantees.

## chromium 158.0.8127.18

### small (1,000 words, 5,785 chars; 409 ranges in initial 3-group pass; calls >50 ms: 0/160; heap MB baseline/highlighted/after destroy: 1.2/1.6/1.5)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 0.5 | 0.6 | 20 |
| search_term_update | 0.3 | 0.4 | 20 |
| multiple_group_update | 1 | 1.4 | 20 |
| regex_matching | 0.3 | 0.4 | 20 |
| rapid_search_updates_8_keystrokes | 1.8 | 2 | 20 |
| dom_mutation_update | 0.2 | 0.3 | 20 |
| clear_highlights | 0.1 | 0.1 | 20 |
| instance_destruction | 0 | 0.1 | 20 |

### medium (10,000 words, 58,026 chars; 3,996 ranges in initial 3-group pass; calls >50 ms: 0/120; heap MB baseline/highlighted/after destroy: 1.2/1.8/1.6)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 3.7 | 8.6 | 15 |
| search_term_update | 2.4 | 3.2 | 15 |
| multiple_group_update | 10.1 | 12.4 | 15 |
| regex_matching | 2.7 | 3.3 | 15 |
| rapid_search_updates_8_keystrokes | 16.4 | 17.8 | 15 |
| dom_mutation_update | 1.8 | 2.4 | 15 |
| clear_highlights | 0.6 | 0.8 | 15 |
| instance_destruction | 0.1 | 0.2 | 15 |

### large (50,000 words, 290,181 chars; 19,905 ranges in initial 3-group pass; calls >50 ms: 20/80; heap MB baseline/highlighted/after destroy: 1.2/2.8/2.1)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 18.7 | 27.4 | 10 |
| search_term_update | 14 | 18.3 | 10 |
| multiple_group_update | 59.7 | 72.1 | 10 |
| regex_matching | 17.7 | 20.3 | 10 |
| rapid_search_updates_8_keystrokes | 105.3 | 111.9 | 10 |
| dom_mutation_update | 12.7 | 14.6 | 10 |
| clear_highlights | 4.3 | 7.9 | 10 |
| instance_destruction | 0.5 | 0.7 | 10 |

### very_large (100,000 words, 580,502 chars; 39,763 ranges in initial 3-group pass; calls >50 ms: 17/64; heap MB baseline/highlighted/after destroy: 1.2/4.1/2.7)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 38 | 50.5 | 8 |
| search_term_update | 29.8 | 37.1 | 8 |
| multiple_group_update | 133.5 | 151.4 | 8 |
| regex_matching | 39.9 | 43.9 | 8 |
| rapid_search_updates_8_keystrokes | 264.2 | 273.5 | 8 |
| dom_mutation_update | 31.5 | 33.7 | 8 |
| clear_highlights | 15.2 | 17.4 | 8 |
| instance_destruction | 1.5 | 2 | 8 |

### stress (172,256 words, 1,000,006 chars; 68,520 ranges in initial 3-group pass; calls >50 ms: 29/40; heap MB baseline/highlighted/after destroy: 1.2/5.9/3.5)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 66.8 | 83.6 | 5 |
| search_term_update | 60.2 | 63.7 | 5 |
| multiple_group_update | 252.3 | 254.7 | 5 |
| regex_matching | 78.3 | 84.1 | 5 |
| rapid_search_updates_8_keystrokes | 507.6 | 527 | 5 |
| dom_mutation_update | 60.1 | 65.1 | 5 |
| clear_highlights | 37.4 | 39.9 | 5 |
| instance_destruction | 3.7 | 4.1 | 5 |

## firefox 159.0

### small (1,000 words, 5,785 chars; 409 ranges in initial 3-group pass; calls >50 ms: 0/160; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 2 | 3 | 20 |
| search_term_update | 1 | 2 | 20 |
| multiple_group_update | 3 | 6 | 20 |
| regex_matching | 1 | 2 | 20 |
| rapid_search_updates_8_keystrokes | 5 | 12 | 20 |
| dom_mutation_update | 1 | 2 | 20 |
| clear_highlights | 1 | 1 | 20 |
| instance_destruction | 0 | 1 | 20 |

### medium (10,000 words, 58,026 chars; 3,996 ranges in initial 3-group pass; calls >50 ms: 18/120; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 18 | 32 | 15 |
| search_term_update | 14 | 24 | 15 |
| multiple_group_update | 48 | 79 | 15 |
| regex_matching | 16 | 26 | 15 |
| rapid_search_updates_8_keystrokes | 102 | 201 | 15 |
| dom_mutation_update | 13 | 23 | 15 |
| clear_highlights | 11 | 22 | 15 |
| instance_destruction | 2 | 3 | 15 |

### large (50,000 words, 290,181 chars; 19,905 ranges in initial 3-group pass; calls >50 ms: 46/80; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 66 | 110 | 10 |
| search_term_update | 50 | 86 | 10 |
| multiple_group_update | 178 | 287 | 10 |
| regex_matching | 52 | 89 | 10 |
| rapid_search_updates_8_keystrokes | 349 | 642 | 10 |
| dom_mutation_update | 44 | 78 | 10 |
| clear_highlights | 36 | 71 | 10 |
| instance_destruction | 6 | 12 | 10 |

### very_large (100,000 words, 580,502 chars; 39,763 ranges in initial 3-group pass; calls >50 ms: 50/64; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 115 | 203 | 8 |
| search_term_update | 87 | 144 | 8 |
| multiple_group_update | 316 | 498 | 8 |
| regex_matching | 92 | 156 | 8 |
| rapid_search_updates_8_keystrokes | 601 | 1040 | 8 |
| dom_mutation_update | 70 | 130 | 8 |
| clear_highlights | 58 | 114 | 8 |
| instance_destruction | 10 | 18 | 8 |

### stress (172,256 words, 1,000,006 chars; 68,520 ranges in initial 3-group pass; calls >50 ms: 33/40; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 176 | 251 | 5 |
| search_term_update | 142 | 173 | 5 |
| multiple_group_update | 484 | 663 | 5 |
| regex_matching | 131 | 196 | 5 |
| rapid_search_updates_8_keystrokes | 814 | 1218 | 5 |
| dom_mutation_update | 95 | 147 | 5 |
| clear_highlights | 73 | 123 | 5 |
| instance_destruction | 14 | 22 | 5 |

## webkit 27.2

### small (1,000 words, 5,785 chars; 409 ranges in initial 3-group pass; calls >50 ms: 0/160; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 1 | 1 | 20 |
| search_term_update | 1 | 2 | 20 |
| multiple_group_update | 5 | 6 | 20 |
| regex_matching | 1 | 2 | 20 |
| rapid_search_updates_8_keystrokes | 11 | 14 | 20 |
| dom_mutation_update | 1 | 2 | 20 |
| clear_highlights | 1 | 2 | 20 |
| instance_destruction | 1 | 2 | 20 |

### medium (10,000 words, 58,026 chars; 3,996 ranges in initial 3-group pass; calls >50 ms: 21/120; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 9 | 14 | 15 |
| search_term_update | 15 | 29 | 15 |
| multiple_group_update | 60 | 107 | 15 |
| regex_matching | 19 | 32 | 15 |
| rapid_search_updates_8_keystrokes | 145 | 255 | 15 |
| dom_mutation_update | 17 | 34 | 15 |
| clear_highlights | 15 | 32 | 15 |
| instance_destruction | 14 | 31 | 15 |

### large (50,000 words, 290,181 chars; 19,905 ranges in initial 3-group pass; calls >50 ms: 71/80; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 107 | 115 | 10 |
| search_term_update | 115 | 142 | 10 |
| multiple_group_update | 466 | 517 | 10 |
| regex_matching | 125 | 134 | 10 |
| rapid_search_updates_8_keystrokes | 731 | 835 | 10 |
| dom_mutation_update | 86 | 96 | 10 |
| clear_highlights | 79 | 93 | 10 |
| instance_destruction | 72 | 86 | 10 |

### very_large (100,000 words, 580,502 chars; 39,763 ranges in initial 3-group pass; calls >50 ms: 52/64; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 348 | 353 | 8 |
| search_term_update | 220 | 232 | 8 |
| multiple_group_update | 982 | 1030 | 8 |
| regex_matching | 203 | 222 | 8 |
| rapid_search_updates_8_keystrokes | 627 | 725 | 8 |
| dom_mutation_update | 56 | 72 | 8 |
| clear_highlights | 49 | 66 | 8 |
| instance_destruction | 42 | 55 | 8 |

### stress (172,256 words, 1,000,006 chars; 68,520 ranges in initial 3-group pass; calls >50 ms: 40/40; heap MB baseline/highlighted/after destroy: n/a)

| operation | p50 ms | p95 ms | runs |
|---|---:|---:|---:|
| initial_highlighting | 952 | 960 | 5 |
| search_term_update | 654 | 670 | 5 |
| multiple_group_update | 2872 | 2947 | 5 |
| regex_matching | 587 | 599 | 5 |
| rapid_search_updates_8_keystrokes | 1896 | 1963 | 5 |
| dom_mutation_update | 178 | 199 | 5 |
| clear_highlights | 164 | 184 | 5 |
| instance_destruction | 158 | 172 | 5 |
