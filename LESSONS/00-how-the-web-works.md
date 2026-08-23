# 00 — How the web works (for a Python developer)

You know Python. Here's the mapping from what you know to what we just built.

## The three pieces of a web app

1. **A server** — a program that listens on a port and answers HTTP requests.
   Ours is `server/app.py`, built with FastAPI. `uvicorn server.app:app --port 8000`
   starts it listening on `http://127.0.0.1:8000`. This is just a Python
   process, same as running any script — it just doesn't exit, it waits.

2. **HTML** — the *structure* of a page. Not code that runs — a description
   of what elements exist. `web/index.html` says "there's a header, a div
   with id=starters, a button with id=draw-btn." Think of it as a nested
   data structure (it basically is one — the DOM, below).

3. **JavaScript** — the *behavior*. Runs in the browser, not on your server.
   `web/js/draft.js` is the closest thing to your Python game logic: it has
   variables, functions, loops, `if` statements — all familiar. The main
   differences from Python you'll actually notice:
   - `let`/`const` instead of just assigning a name (`const` = never reassigned)
   - `===` instead of `==` (use `===` always — plain `==` does surprising
     type coercion, e.g. `0 == "0"` is `true`)
   - functions are values: `arr.map(x => x * 2)` is a lambda, same idea as
     `[x * 2 for x in arr]`
   - no significant whitespace — `{ }` and `;` do the job indentation does in Python

## The DOM

When the browser loads `index.html`, it builds an in-memory tree of every
element — the **DOM** (Document Object Model). JavaScript's job is mostly
*reading and mutating that tree*. In `draft.js`:

```js
document.getElementById("budget-val").textContent = "75.0"
```

is exactly like doing `some_object.budget_val.text = "75.0"` in Python,
except the "object" is the actual thing rendered on screen — change it, and
the pixels change immediately, no re-render step to think about.

`querySelectorAll`, `addEventListener` — same idea: find element(s), and
say "when X happens to this element, run this function."

## Why the frontend needs to *ask* for data

Python scripts read files straight off disk. A browser can't reach into
your server's `data/seasons/` folder directly — it can only ask the server,
over HTTP, for things the server chooses to expose. That's what
`server/app.py`'s `/api/seasons/{year}` route is: a deliberate, narrow door
into one JSON file.

`web/js/data.js` walks through that door:

```js
async function fetchSeason(year) {
  const res = await fetch(`/api/seasons/${year}`);
  return res.json();
}
```

`fetch()` sends the HTTP request. It's *asynchronous* — network calls take
time, and JavaScript in the browser is single-threaded, so it can't just
block like `requests.get()` does in a Python script (that would freeze the
whole page — no clicks, no scrolling, nothing — until the response arrives).
Instead `fetch()` returns immediately with a **Promise**, a stand-in for
"the value that will exist once this finishes." `await` says "pause *this
function* until the promise resolves, but let everything else on the page
keep working." A function that contains `await` must be declared `async`.

The Python-familiar analogy: it's the same shape as `asyncio` —
`await fetch(...)` here plays the same role as `await session.get(...)` in
`aiohttp`. If you've never used `asyncio`, the mental model is: "this line
takes a while; don't freeze the browser while we wait; resume this function
right here once the answer's back."

## What actually happened when you clicked "Draw"

1. Browser already has all 26 seasons in memory (`data.js` preloaded them
   with `fetch` when the page first loaded).
2. Click fires a listener registered in `draft.js`:
   `$("draw-btn").addEventListener("click", () => { drawNew(); render(); })`
3. `drawNew()` — plain JS, no network — picks a random (year, team) from
   data already in memory and checks eligibility.
4. `render()` rewrites the relevant DOM elements' `innerHTML` and
   `textContent` based on the new state. The browser repaints. That's it —
   there's no "framework," no virtual DOM, no build step. Just: state lives
   in a JS object, and after every change we call one function that
   overwrites the HTML to match that state.

That last pattern — **state object → one render function that rewrites the
DOM from it** — is the core idea behind every JS framework you'll ever meet
(React, Vue, etc.). They just automate the "figure out what actually
changed" part. Worth having built it by hand once.
