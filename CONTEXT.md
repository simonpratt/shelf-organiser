# Shelf Organiser

The contents of one person's shed and back room, sized and tagged so they can see what takes up the space.

## Items

**Item**:
One kind of thing being stored, such as "Camping chairs", with a size, a quantity and any number of tags.
_Avoid_: thing, object, entry, record

**Size**:
How much space one unit of an item takes, in litres.
_Avoid_: dimensions (that word means a top-level tag here), footprint

**Size preset**:
A named everyday container standing for a fixed size (Shoebox, Crate, Storage bin, Large box, Bulky), offered so a size can be picked with one tap.
_Avoid_: template, category

**Quantity**:
How many units of an item there are; 1 when not given.
_Avoid_: count, amount

**Total space**:
An item's size times its quantity; what the app sums and ranks by.
_Avoid_: total volume, footprint

**Dictation**:
A spoken list of items, turned into text by the phone keyboard, that Claude reads into drafts.
_Avoid_: voice note, recording, transcript (in UI copy)

**Draft**:
A proposed item read from a dictation, which the user reviews and edits before it is saved as an item.
_Avoid_: suggestion, pending item

## Tags

**Tag**:
A named node in one tree of tags; each tag has at most one parent tag.
_Avoid_: category, label, folder

**Tag path**:
A tag's names from its top-level tag down, shown as "Location › Shed › Shelf 2" and typed as "Location/Shed/Shelf 2".
_Avoid_: breadcrumb, full name

**Dimension**:
A top-level tag, such as Location or Type, that groups one way of looking at the items.
_Avoid_: root tag, axis, facet

**Untagged**:
Items with no tag in the dimension being looked at, shown together as one block on the space map.
_Avoid_: uncategorised, other

## Space map

**Space map**:
The treemap on the Space screen: one block per tag or item at the current level, its area its total space. An item counts once, under its most specific tag in the dimension.
_Avoid_: chart, heatmap, graph
