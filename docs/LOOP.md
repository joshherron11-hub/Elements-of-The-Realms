# The First Complete Playable Loop

```
ENTER BLACKMERE → MOVE THROUGH TOWN → SPEAK TO NPC → RECEIVE SMALL CONTRACT
→ VISIT MARKET → PURCHASE OR ACQUIRE A COMPANION → CARE FOR COMPANION
→ COMPLETE SEARCH OR DELIVERY → RECEIVE CURRENCY / REPUTATION
→ MAKE ONE SMALL INVESTMENT OR OWNERSHIP DECISION → CHRONICLE RECORDS THE EXPERIENCE
→ SAVE → RELOAD → STATE REMAINS
```

## How to play it (about five minutes)
A **Next:** hint under the status panel walks you through the same steps.

| Step | What to do |
|---|---|
| Enter Blackmere | `npm run dev`, open http://localhost:5173. You start in the Town Square with 40 marks. |
| Move | WASD / arrow keys (Shift to run). Walk west into Hearth Row and back. |
| Speak to an NPC | Walk up to **Pip Ashdown** by the well and press **E**. |
| Receive a contract | In Pip's panel, *Work offered → The Lost Satchel → Do it*. |
| Visit the market | Walk east into the Market. Talk to **Tobias Quill** and buy **Hound Biscuits** (2 mk). |
| Acquire a companion | Leave by the east gate, follow the East Road to **Brindle Farm Edge**, talk to **Hester Brindle** and adopt **Bramble** (12 mk). |
| Care for it | Press **2** (Companion mode), then **C**: *Feed Hound Biscuits*, *Spend time together*. |
| Complete the search | Press **6** (Search mode), walk north into **Hollowmere Woodland Edge**, press **F** to find the satchel. Go back to Pip, press **E**, and hand over both tasks. |
| Get paid | +15 mk, Blackmere standing +5, and Pip's regard and trust. |
| Invest or own | Press **1** (Live). Either buy **Market Stall No. 4** (30 mk) from **Reeve Aldous Crane** at the Keep gatehouse, or take Hester's **cider press** share (20 mk, can be lost). |
| Chronicle | Press **J**: "Your tale so far", your contracts, your standing and every recorded moment. |
| Save | Press **K** (it also autosaves every 30 s). |
| Reload | Refresh the page: "Welcome back", in the same spot with the same everything. |

## How it is verified
- **`tests/loop.test.ts`** plays the exact loop through player intents, saves, reopens
  and checks that the reloaded world equals the saved one (`npm test`).
- **`scripts/smoke-loop.mjs`** (`npm run smoke`) starts the dev server and plays the
  loop in headless Chromium through the real UI with keys and clicks. It reloads the page
  and checks the state is identical and that there were no browser errors. The first time,
  run `npx playwright install chromium`, or set `CHROMIUM_PATH`.
