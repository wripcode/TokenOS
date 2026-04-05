/**
 * Parser verification script — validates semantic roles, tab detection, and meta.
 * Run: npx tsx src/verify-parser.ts
 */

import { parseFile } from "./indexer/parser.js";
import { resolve } from "path";

const testFiles = [
  resolve("dev-data/pattern-test.ts"),
  resolve("dev-data/pattern-test.tsx"),
];

let allNodes: { type: string; name: string; meta?: string }[] = [];
let allEdges: { type: string; from_node: string; to_node: string }[] = [];

for (const filePath of testFiles) {
  console.log(`\n${"=".repeat(56)}\nFILE: ${filePath.split("/").pop()}\n${"=".repeat(56)}`);

  const { nodes, edges } = parseFile(filePath);
  allNodes = [...allNodes, ...nodes];
  allEdges = [...allEdges, ...edges];

  // Nodes by type
  const byType: Record<string, string[]> = {};
  for (const n of nodes) { (byType[n.type] ??= []).push(n.name); }
  console.log("\n📦 NODES:");
  for (const [type, names] of Object.entries(byType)) {
    console.log(`  ${type.padEnd(14)} (${names.length}): ${names.join(", ")}`);
  }

  // Edges by type
  const byEdge: Record<string, number> = {};
  for (const e of edges) { byEdge[e.type] = (byEdge[e.type] ?? 0) + 1; }
  console.log("\n🔗 EDGES:", JSON.stringify(byEdge));

  // JSX specific
  const jsx = edges.filter((e) => ["RENDERS", "CONTAINS", "PART_OF_TAB"].includes(e.type));
  if (jsx.length > 0) {
    console.log("\n📐 JSX / Tab edges:");
    for (const e of jsx) {
      const from = e.from_node.split("::").pop();
      const to = e.to_node.split("::").pop();
      console.log(`  ${e.type.padEnd(14)}: ${from} → ${to}`);
    }
  }

  // Meta output
  const withMeta = nodes.filter((n) => n.meta);
  if (withMeta.length > 0) {
    console.log("\n🏷️  META:");
    for (const n of withMeta) {
      console.log(`  ${n.name.padEnd(20)} → ${n.meta}`);
    }
  }
}

console.log("\n\n✅ SUMMARY");
console.log(`  Total nodes: ${allNodes.length}`);
console.log(`  Total edges: ${allEdges.length}`);
const types = [...new Set(allNodes.map((n) => n.type))].sort();
const edgeTypes = [...new Set(allEdges.map((e) => e.type))].sort();
console.log(`  Node types: ${types.join(", ")}`);
console.log(`  Edge types: ${edgeTypes.join(", ")}`);

// Assertions
const expectedTypes = ["component", "enum", "file", "function", "import", "interface", "type_alias", "variable"];
const missingTypes = expectedTypes.filter((t) => !types.includes(t));
if (missingTypes.length === 0) {
  console.log("\n✅ ALL expected node types present");
} else {
  console.error(`\n❌ Missing node types: ${missingTypes.join(", ")}`);
  process.exit(1);
}

const expectedEdges = ["RENDERS", "CONTAINS", "PART_OF_TAB"];
const missingEdges = expectedEdges.filter((t) => !edgeTypes.includes(t));
if (missingEdges.length === 0) {
  console.log("✅ ALL expected JSX/Tab edge types present");
} else {
  console.error(`❌ Missing edge types: ${missingEdges.join(", ")}`);
  process.exit(1);
}

// Meta assertions
const metaNodes = allNodes.filter((n) => n.meta);
if (metaNodes.length > 0) {
  console.log(`✅ ${metaNodes.length} nodes have semantic meta`);
  // Check at least one has a role
  const withRole = metaNodes.filter((n) => JSON.parse(n.meta!).role);
  if (withRole.length > 0) {
    console.log(`✅ ${withRole.length} nodes have role assignments`);
  } else {
    console.error("❌ No nodes have role assignments");
    process.exit(1);
  }
  // Check at least one has tab
  const withTab = metaNodes.filter((n) => JSON.parse(n.meta!).tab);
  if (withTab.length > 0) {
    console.log(`✅ ${withTab.length} nodes have tab assignments`);
  } else {
    console.error("❌ No nodes have tab assignments");
    process.exit(1);
  }
} else {
  console.error("❌ No nodes have semantic meta");
  process.exit(1);
}
