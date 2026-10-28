[33mcommit 8585d4ddb915c7983a344b856dd114d065c804dd[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m)[m
Author: web4REXXIE <rexonwe100@gmail.com>
Date:   Sun Oct 25 11:35:17 2026 +0100

    Stage 3: payment success, availability note, tenancy redirect

 app/api/paystack/initialize/route.ts               |   8 [32m+[m
 app/api/paystack/status/route.ts                   |   7 [32m+[m[31m-[m
 app/applications/page.tsx                          | 404 [32m+[m[31m--------------------[m
 app/tenancies/[id]/pay/page.tsx                    |  23 [32m+[m[31m-[m
 app/tenancies/page.tsx                             |  56 [32m++[m[31m-[m
 components/availability-note.tsx                   |  37 [32m++[m
 components/pay-online-panel.tsx                    | 293 [32m++++++++++[m[31m-----[m
 components/payment-success.tsx                     |  54 [32m+++[m
 components/renewal-panel.tsx                       |  12 [32m+[m[31m-[m
 components/rental-journey.tsx                      |  27 [32m+[m[31m-[m
 lib/availability.ts                                |  50 [32m+++[m
 lib/payment-complete.ts                            | 158 [32m++++++++[m
 lib/rental-journey.ts                              |  19 [32m+[m[31m-[m
 lib/use-listing-activity.ts                        |  61 [32m++++[m
 .../20261108_01_listing_application_activity.sql   |  41 [32m+++[m
 tests/renewal.test.mjs                             |  79 [32m++[m[31m--[m
 tests/stage3.test.mjs                              |  38 [32m++[m
 tests/tenancy-routes.test.mjs                      |   8 [32m+[m[31m-[m
 ...ngs-status.test.mjs => viewing-status.test.mjs} |  14 [32m+[m[31m-[m
 tsconfig.tsbuildinfo                               |   2 [32m+[m[31m-[m
 20 files changed, 824 insertions(+), 567 deletions(-)
