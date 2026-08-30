// lib/monday.ts
// All communication with monday.com's GraphQL API lives here.

const MONDAY_API_URL = "https://api.monday.com/v2";

export async function mondayQuery(query: string, variables: Record<string, any> = {}) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.MONDAY_API_TOKEN as string,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (json.errors) {
    throw new Error(`monday.com API error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

// Fetches ALL items from a board, paging through results automatically.
export async function fetchBoardItems(boardId: string) {
  const items: any[] = [];
  let cursor: string | null = null;

  do {
    const query = `
      query ($boardId: [ID!], $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: 100, cursor: $cursor) {
            cursor
            items {
              id
              name
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

    const data = await mondayQuery(query, { boardId: [boardId], cursor });
    const page = data.boards[0].items_page;

    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);

  return items;
}

// Fetches the column ID -> human-readable title mapping for a board.
export async function fetchBoardColumns(boardId: string) {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        columns {
          id
          title
          type
        }
      }
    }
  `;
  const data = await mondayQuery(query, { boardId: [boardId] });
  const columns = data.boards[0].columns;

  const map: Record<string, string> = {};
  for (const col of columns) {
    map[col.id] = col.title;
  }
  return map;
}

// Combines the two above: returns clean row objects keyed by real column
// names instead of cryptic IDs. Blank cells become explicit `null`
// (never guessed/filled) so downstream code can flag missing data honestly.
export async function fetchCleanBoardItems(boardId: string) {
  const [items, columnMap] = await Promise.all([
    fetchBoardItems(boardId),
    fetchBoardColumns(boardId),
  ]);

  return items.map((item) => {
    const row: Record<string, string | null> = { Item: item.name };
    for (const cv of item.column_values) {
      const label = columnMap[cv.id] || cv.id;
      row[label] = cv.text && cv.text.trim() ? cv.text.trim() : null;
    }
    return row;
  });
}