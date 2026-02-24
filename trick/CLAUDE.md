- Follow the KISS methodology
- Use vanilla typescript with JSDoc syntax
- We're writing a game -- it's okay to just have a lot of global variables, as long as we keep the usage of each global variable simple.
- Don't try to make polished graphics. We're just vibe coding a gameplay prototype, visuals don't matter.
- Keep it simple!
- Run `tsc` to typecheck


# Files
- game.js -- all game logic. Very simple and small (<1000 LOC) 
- ui.js -- very small and mimimal library for creating DOM elements
  - Has functions for creating elements (`div`, `span`, `p`, `a`, `button`, `h` for any custom element, etc.)
  - Has a function for creating `css`
  - Extremely simple, you can probably just figure this out by example reading game.jss
- index.html -- nothing interesting, just a div with id root and a script which loads game.js

That's it!
