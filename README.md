# Shelf Organiser

A self-hosted app for cataloguing what's in your shed or back room, so you can see what takes up the space.

- Add items from your phone with a one-tap size preset, or type the litres
- Tag items with nested tags such as `Location › Shed › Shelf 2`, creating them as you type
- See every item ranked by the total space it takes
- Search by name, note or tag, and filter to any tag and everything inside it
- Rename, move and delete tags without losing items

<table>
  <tr>
    <td><img src="docs/screenshots/items.png" width="200" alt="Item list ranked by total space, with tag chips on each item"></td>
    <td><img src="docs/screenshots/add.png" width="200" alt="Add item form with size presets, quantity and tag suggestions"></td>
    <td><img src="docs/screenshots/tags.png" width="200" alt="Tag tree with Location and Type dimensions and item counts"></td>
  </tr>
  <tr><td>Items</td><td>Add item</td><td>Tags</td></tr>
</table>

## Deploy

No image is published yet; build it with `docker build -t shelf-organiser .`. It serves on port 8080 and keeps its SQLite database in the `/data` volume. The container runs as UID/GID 65532, so a bind-mounted `/data` must be writable by that user.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `/data` | Directory holding `shelf.db` |
| `PORT` | `8080` | Listen port |

Test-only settings are in `.env.example`.

## Notes

- There is no login: run it on a trusted LAN only.
- Deleting a tag also deletes the tags inside it; the items stay.

## Development

Go 1.27, Node 22 and pnpm (via corepack). `make dev` runs the server and Vite, `make check` the linters and unit tests, `make e2e` the Playwright suite and `make docker` the image. The domain glossary is `CONTEXT.md`, the API spec `apps/server/openapi/openapi.yaml`, and agent notes `CLAUDE.md`.
