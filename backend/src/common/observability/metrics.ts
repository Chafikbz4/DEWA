/**
 * Minimal Prometheus registry (text exposition format 0.0.4), no external
 * dependency: HTTP request counter + latency histogram, process gauges and
 * named business counters incremented by the domain.
 */
const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Labels = Record<string, string>;
const key = (l: Labels) =>
  Object.entries(l)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`)
    .join(',');

class Registry {
  private readonly counters = new Map<
    string,
    { help: string; values: Map<string, number> }
  >();
  private readonly histograms = new Map<
    string,
    { counts: number[]; sum: number; count: number }
  >();

  inc(name: string, help: string, labels: Labels = {}, by = 1) {
    const c = this.counters.get(name) ?? { help, values: new Map() };
    const k = key(labels);
    c.values.set(k, (c.values.get(k) ?? 0) + by);
    this.counters.set(name, c);
  }

  observeHttp(method: string, route: string, status: number, seconds: number) {
    this.inc('http_requests_total', 'HTTP requests', {
      method,
      route,
      status: String(status),
    });
    const k = key({ method, route });
    const h = this.histograms.get(k) ?? {
      counts: BUCKETS.map(() => 0),
      sum: 0,
      count: 0,
    };
    BUCKETS.forEach((b, i) => {
      if (seconds <= b) h.counts[i]++;
    });
    h.sum += seconds;
    h.count++;
    this.histograms.set(k, h);
  }

  render(): string {
    const out: string[] = [];
    for (const [name, c] of this.counters) {
      out.push(`# HELP ${name} ${c.help}`, `# TYPE ${name} counter`);
      for (const [k, v] of c.values)
        out.push(`${name}${k ? `{${k}}` : ''} ${v}`);
    }
    out.push(
      '# HELP http_request_duration_seconds HTTP request latency',
      '# TYPE http_request_duration_seconds histogram',
    );
    for (const [k, h] of this.histograms) {
      BUCKETS.forEach((b, i) =>
        out.push(
          `http_request_duration_seconds_bucket{${k},le="${b}"} ${h.counts[i]}`,
        ),
      );
      out.push(
        `http_request_duration_seconds_bucket{${k},le="+Inf"} ${h.count}`,
      );
      out.push(
        `http_request_duration_seconds_sum{${k}} ${h.sum.toFixed(6)}`,
        `http_request_duration_seconds_count{${k}} ${h.count}`,
      );
    }
    const mem = process.memoryUsage();
    out.push(
      '# HELP process_resident_memory_bytes Resident memory',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${mem.rss}`,
      '# HELP nodejs_heap_used_bytes Heap used',
      '# TYPE nodejs_heap_used_bytes gauge',
      `nodejs_heap_used_bytes ${mem.heapUsed}`,
      '# HELP process_uptime_seconds Uptime',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${Math.round(process.uptime())}`,
    );
    return `${out.join('\n')}\n`;
  }
}

export const metrics = new Registry();
