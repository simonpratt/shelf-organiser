# Claude proposes Type tags on request: one Suggest button and one Organise screen

So that nobody has to build a taxonomy or tag every item by hand, Claude proposes tags in two places, both backed by one server call that sends the tag tree and the items and gets proposals back as structured output:

- **Suggest tags** on the item form and on each dictation draft: one tap sends that item's name and note, and up to three proposed tags come back as chips. Nothing is added until a chip is tapped.
- **Organise**, from the item list: Claude reads every item and the tree, picks the Type dimension, proposes one tag for each item that has none in it (at most 40 a run, so the review stays short and the answer comes back in seconds), and builds out the Type tree as it goes. The user removes or edits proposals on one review screen, and Apply adds the tags in one transaction.

Proposals may name tags that don't exist yet, shown as **New**. They are only ever in the Type dimension. Claude can't know where things are, so Location stays the user's. Dimension names aren't hard-coded: Claude decides which top-level tag says what things are, or proposes a new `Type`. The server then throws away any proposal outside that dimension, and any proposal for an item that already has a tag in it. Both are calls to **Claude Haiku 5.5** at low effort (about $0.0002 for a Suggest and $0.002 for Organising 200 items), because this is short classification over a small tree. Dictation stays on Opus, which does better at estimating sizes from loose speech. Without an API key both entry points are hidden, like dictation.

## Considered options

- **Suggestions as the name is typed (debounced)**: a call on most items, chips that move around while typing, and a cost that grows with every keystroke. One tap is cheap enough and leaves the user in charge.
- **Let dictation drafts arrive with new tags**: the Opus dictation prompt would also have to design the taxonomy, and the review screen would carry new tags on every draft. Drafts keep their existing-tags-only rule. After saving a dictation, Suggest per draft or Organise afterwards covers it.
- **Tree hygiene (merging `Camping` and `Camping gear`, flattening single-child chains)**: it needs a tag-merge operation and a second review flow. Organise is told to reuse existing tags, which stops most duplicates forming, and the Tags screen can already rename, move and delete tags. Not built.
- **Proposing Location tags too**: Claude can only guess where things are. Not built.
