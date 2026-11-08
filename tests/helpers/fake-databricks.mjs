// A tiny stand-in for the Databricks SQL Statement Execution API.
export function fakeDatabricks({ host, token, warehouseId, pendingFirst = false, failEvents = false } = {}) {
  const db = { row: null, events: [], statements: [], pending: new Map() };
  const ok = (columns, rows, id = crypto.randomUUID()) => ({
    statement_id: id,
    status: { state: "SUCCEEDED" },
    manifest: { schema: { columns: columns.map((name) => ({ name })) } },
    result: { data_array: rows },
  });
  function run(statement, params) {
    db.statements.push(statement);
    const p = Object.fromEntries(params.map((x) => [x.name, x.value]));
    if (/^CREATE TABLE IF NOT EXISTS/.test(statement)) return ok([], []);
    if (/^INSERT INTO \S*kincard_events/.test(statement)) {
      if (failEvents)
        return { status: { state: "FAILED", error: { error_code: "INSUFFICIENT_PRIVILEGES", message: "no" } } };
      const count = (statement.match(/:id\d+/g) || []).length;
      for (let i = 0; i < count; i++)
        db.events.push({
          at: p[`at${i}`],
          event_type: p[`type${i}`],
          section: p[`section${i}`],
          note: p[`note${i}`],
          source: p[`source${i}`],
          household: p[`household${i}`],
        });
      return ok(["num_affected_rows"], [[String(count)]]);
    }
    if (/^SELECT payload FROM/.test(statement))
      return ok(["payload"], db.row ? [[db.row.payload]] : []);
    if (/^INSERT INTO/.test(statement)) {
      if (!db.row) db.row = { revision: Number(p.revision), payload: p.payload };
      return ok(["num_affected_rows", "num_inserted_rows"], [["1", "1"]]);
    }
    if (/^UPDATE/.test(statement)) {
      if (db.row && db.row.revision === Number(p.expected)) {
        db.row = { revision: Number(p.next), payload: p.payload };
        return ok(["num_affected_rows"], [["1"]]);
      }
      return ok(["num_affected_rows"], [["0"]]);
    }
    if (/^SELECT revision, payload FROM/.test(statement))
      return ok(["revision", "payload"], db.row ? [[String(db.row.revision), db.row.payload]] : []);
    return { status: { state: "FAILED", error: { error_code: "PARSE_SYNTAX_ERROR", message: "unknown" } } };
  }
  const fetcher = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith(`${host}/api/2.0/sql/statements/`)) throw new Error(`Unexpected URL ${u}`);
    if (new Headers(init.headers).get("authorization") !== `Bearer ${token}`)
      return new Response("{}", { status: 401 });
    if ((init.method || "GET") === "POST") {
      const body = JSON.parse(init.body);
      if (body.warehouse_id !== warehouseId) return new Response("{}", { status: 404 });
      const result = run(body.statement, body.parameters || []);
      if (pendingFirst) {
        const id = crypto.randomUUID();
        db.pending.set(id, result);
        return Response.json({ statement_id: id, status: { state: "PENDING" } });
      }
      return Response.json(result);
    }
    const id = decodeURIComponent(u.split("/").pop());
    return Response.json({ ...db.pending.get(id), statement_id: id });
  };
  return { db, fetcher };
}
