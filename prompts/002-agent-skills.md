# 002 — Agent skills (`.skills/`)

Tool: Claude Code (Claude Opus 5.5), 2026-10-16.

These are the verbatim user prompts from the session that produced `.skills/compas-context/` and added `.skills/` to this repository. Prompts 2–8 answer design questions the assistant asked during a `/grill-me` interview. The assistant's questions are not reproduced here.

`.skills/hackathon-ai-rules/` was created in an earlier session and copied here unchanged, except for one note about `python` on Windows. Its prompts were not available in this session. TODO: add them from that session's history.

## 1

```text
in this environment i want to develop my hackaton idea for the hackaton described in the papers @.pdf_md\ (view a resume). I want to start adding some skills i want create for my team to use, for example @hackathon-ai-rules\ and the new one i want to create now that need to serve as a contextualization in the actual idea i want to implement, use /grill-me to understand all parts of my idea, after mi explanation. The idea i want to develop is compas, this is not a new wallet instead act as a plugin that all the colombian wallets can use and integrate; the idea behind is the autorization of payments to solve cases like i send money from US to my family in Colombia and i only auth that money to be spent in medicine (because my mother need it) so the idea of compas is that it auths the markets/ventors with the real intended spent. The motivation for the users is my previous explained scenario (we can go deeper after in how the shops are autorized, but we are thiking things like capturing is motivation from oficial Industria Y Comercio DB or basing it in the current business options of the wallets) for the shops we want to add the state bonuses motivation, the state create food bonuses (we can search actual documentated problems) and the shop register itself in compas to allow the spent of those bonuses, linking my auth payment in what is intended for.
```

## 2

```text
Yes the option A is our idea, we ensure the usage and benefit of open payment with the wait until autorization, the real autorization of the shops category come from our compas solution. How that that works will be part of our work where we think to integrate the own wallet business option (bancolombia and nequi negocios) and/or matching the shop with real industria y comercio databases, here we can reasearch a little over time series oi ai definition integration to define the actual category (of course an ai is not deterministic but can serve as a extra layer)
```

## 3

```text
Yes the AI from option A fits better
```

## 4

```text
The description of the option A is our selection, the reputation state and confidence is a good explanation
```

## 5

```text
Our idea is yes a mix between A and B where mama can autorize the purchase and in some cases the sender, for example when the category of the bill its outside the category it can still be approved; also for mama auth we seek to create both the usual autorization with QR or the one used in opent payments but to pursue inclusion we can propose nfc auth cards as the mama may not know how a virtual wallet works
```

## 6

```text
the idea is still a plugin and i like option A but couldnt we integrate a little of B as every wallet may serve as a node in the ecosystem acting as a ledger from the open payments schema
```

## 7

```text
yes option A matches
```

## 8

```text
option A is perfect as the app should be as simple as possible for mama
```

## 9

```text
the implementation plan is no needed as we will build as it goes, the recommended stack is useful. Remember what we want to build with these answers: we can save a report with all details of sources or material found in this session but we need a light ai skill explanation of the project, serving as a reusable prompt to build compas
```

## 10

```text
i pull the last scaffold changes in @compas\ lets add a folder .skills/ adding these 2 skills we created and that my own teammate agents can load
```
