# 01 — Scraping, caching, and the bugs we actually hit

This is the pipeline you'll spend the least time explaining to yourself
later, because it's the one written in your native language. But three real
bugs came out of building it, and they're worth understanding, not just
having fixed.

## Why cache raw HTML at all?

`pipeline/fetch.py` downloads a page once and saves it verbatim to
`cache/raw/`. `pipeline/parse.py` never touches the network — it only reads
those cached files. This split exists because **parsing is where you make
mistakes**, and re-downloading every time you fix a parsing bug is slow and
rude to the server we're borrowing data from. With the cache, we edited
`parse.py` probably fifteen times while building this and never sent a
second request for a page we already had.

The rule of thumb: separate "get the data" from "make sense of the data"
into two scripts whenever the source is slow, rate-limited, or otherwise
expensive to hit twice.

## Bug 1 — silent field mapping

`pos` (position — "SF", "PG") went through the same numeric parser
(`_num()`, which does `float(text)`) as every other stat field, because it
was listed in the same dict of "stat name → our field name" as `pts`,
`reb`, etc. `float("SF")` raises `ValueError`, `_num()` catches that and
returns `None` — so every player's position silently became `None`. No
crash, no error message. Just wrong data, discovered by printing a
`Counter` of position values and seeing `{None: 1173}` where five real
positions should have been.

**Lesson:** a blanket "convert everything the same way" loop is fast to
write and dangerous — it has no way to complain when one field doesn't fit
the pattern. Text fields and numeric fields need different code paths, and
the difference should be visible at a glance in the source, not discovered
by testing.

## Bug 2 — the encoding double-scramble

Names like "Fernández" showed up as "FernÃ¡ndez". That specific garbling is
recognizable: it's what happens when UTF-8 bytes (which use two bytes,
`0xC3 0xA1`, to represent "á") get *misread* as Latin-1 (which treats every
byte as one character), producing two wrong characters instead of one right
one — and then, when we wrote that wrong text back out as UTF-8, it got
baked in permanently, byte for byte.

The fix had two parts, and both mattered:
1. **Stop the bug at the source** — `resp.encoding = "utf-8"` in `fetch.py`,
   forced explicitly rather than trusting `requests`' auto-detection.
2. **Repair what already got corrupted** — for text mangled this specific
   way, the fix is a reversible round-trip: `text.encode("latin-1").decode("utf-8")`.
   Re-encode the wrongly-decoded characters back to their original bytes,
   then decode those bytes correctly. We ran that across every cached file,
   verified it changed exactly the files with the bug (76 of 78 — the other
   2 were already correct, and the round-trip fails loudly on already-correct
   text, which is itself a useful safety property).

**Lesson:** when text looks like corrupted gibberish but the gibberish is
*consistent* (same wrong pattern every time), that consistency means it's a
mechanical, fixable transformation — not random data loss. Recognize the
pattern before reaching for "just re-download everything."

## Bug 3 — "Oklahoma City Thunder" in the year 2000

The 2000-01 season's Seattle SuperSonics were rendering as "Oklahoma City
Thunder" — the franchise's *current* name, not what it was called that
season (Seattle didn't move to OKC until 2008). The bug: `parse.py` had a
franchise-code lookup table (`FRANCHISES`) that exists to solve a real
problem — grouping "SEA" and "OKC" tricodes as one continuous franchise so
career stats don't fragment across a relocation — but the code also pulled
the *display name* from that same lookup table, always returning the
franchise's modern name regardless of which season was being rendered.

The fix: keep two different pieces of data doing two different jobs.
The franchise code is a stable **grouping key** (and a source for jersey
colors, which we do want continuous across relocations). The team **name**
shown to the player has to come from that season's own scraped page, so a
2001 draw says "Seattle SuperSonics" and a 2010 draw of the same franchise
says "Oklahoma City Thunder."

**Lesson:** when one lookup table answers two different questions ("what
franchise is this, for grouping" vs. "what should I call this, right now"),
conflating them is an easy mistake that won't show up until you look at a
specific historical case. This is also exactly the kind of bug a
"time machine" game will surface immediately, since the entire premise is
showing things as they were — which made it worth catching now rather than
later.
