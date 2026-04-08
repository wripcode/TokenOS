import { Project, SyntaxKind, Node } from "ts-morph";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { basename, relative } from "path";
import type { ParsedNode, ParsedEdge, NodeType } from "../types.js";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: true, jsx: 4 }, // 4 = JsxEmit.ReactJSX
});

// ───── Helpers ───────────────────────────────────────────────────────────────

function nodeId(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function snippet(code: string, maxLines = 12): string {
  return code.split("\n").slice(0, maxLines).join("\n");
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function containsJsx(node: Node): boolean {
  return (
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  );
}

// ───── Semantic Meta ─────────────────────────────────────────────────────────

interface NodeMeta {
  role?: string;
  tab?: string;
  feature?: string;
  route?: string;
}

/** Infer UI role from filename or component name */
const ROLE_PATTERNS: Array<[RegExp, string]> = [
  [/panel/i, "panel"],
  [/tab/i, "tab"],
  [/page/i, "page"],
  [/dialog|modal/i, "dialog"],
  [/form/i, "form"],
  [/sidebar|nav/i, "navigation"],
  [/header/i, "header"],
  [/footer/i, "footer"],
  [/content/i, "content"],
  [/list/i, "list"],
  [/card/i, "card"],
  [/button/i, "action"],
  [/layout/i, "layout"],
];

function inferRole(name: string, fileName: string): string | undefined {
  // Check component name first, then filename
  for (const [pattern, role] of ROLE_PATTERNS) {
    if (pattern.test(name) || pattern.test(fileName)) return role;
  }
  return undefined;
}

/** Infer feature from directory path */
function inferFeature(filePath: string): string | undefined {
  // Next.js App Router: app/(group)/feature-name/...
  const appMatch = filePath.match(/app\/(?:\([^)]+\)\/)*([^/]+)\//);
  if (appMatch && appMatch[1] !== "api") return appMatch[1];

  // Components grouped by feature: components/feature-name/...
  const compMatch = filePath.match(/components\/([^/]+)\//);
  if (compMatch) return compMatch[1];

  return undefined;
}

/** Detect Next.js App Router route from file path */
function detectRoute(filePath: string): string | undefined {
  // Match: app/(optional-group)/segment/.../page.tsx
  const routeMatch = filePath.match(/app\/(?:\([^)]+\)\/)*(.+?)\/page\.tsx?$/);
  if (routeMatch) {
    return `/${routeMatch[1]}`;
  }
  return undefined;
}

function serializeMeta(meta: NodeMeta): string | undefined {
  // Only serialize if at least one field is set
  if (!meta.role && !meta.tab && !meta.feature && !meta.route) return undefined;
  return JSON.stringify(meta);
}

// ───── Main parser ──────────────────────────────────────────────────────────

export interface ParseResult {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  hash: string;
}

export function parseFile(filePath: string): ParseResult {
  let sourceFile = project.getSourceFile(filePath);
  if (sourceFile) {
    sourceFile.refreshFromFileSystemSync();
  } else {
    sourceFile = project.addSourceFileAtPath(filePath);
  }

  const content = sourceFile.getFullText();
  const fileHash = hashContent(content);
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];

  const fileName = basename(filePath).replace(/\.tsx?$/, "");
  const feature = inferFeature(filePath);

  // ── File node ──────────────────────────────────────────────────────────────
  const fileNodeId = nodeId(filePath, fileName);
  const fileMeta: NodeMeta = {};
  if (feature) fileMeta.feature = feature;

  nodes.push({
    id: fileNodeId,
    type: "file",
    name: fileName,
    file_path: filePath,
    hash: fileHash,
    meta: serializeMeta(fileMeta),
  });

  // ── Route detection (Next.js App Router) ───────────────────────────────────
  const route = detectRoute(filePath);
  if (route) {
    const routeId = nodeId(filePath, `route:${route}`);
    nodes.push({
      id: routeId,
      type: "route",
      name: route,
      file_path: filePath,
      meta: JSON.stringify({ route }),
    });
    edges.push({ from_node: routeId, to_node: fileNodeId, type: "DEFINES" });
  }

  // ── Functions & Components ─────────────────────────────────────────────────
  const allFunctions = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
  ];

  for (const fn of allFunctions) {
    let name: string | undefined;

    if (Node.isFunctionDeclaration(fn)) {
      name = fn.getName();
    } else if (Node.isArrowFunction(fn)) {
      const varDecl = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (varDecl) name = varDecl.getName();
    }

    if (!name) continue;

    // Skip nested arrow functions → prevents double-indexing
    if (Node.isArrowFunction(fn)) {
      const parentArrow = fn.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
      const parentFn = fn.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
      if (parentArrow || parentFn) continue;
    }

    const isComponent = isPascalCase(name) && containsJsx(fn);
    const nodeType: NodeType = isComponent ? "component" : "function";

    // ── Build meta ────────────────────────────────────────────────────────
    const meta: NodeMeta = {};
    if (isComponent) {
      const role = inferRole(name, fileName);
      if (role) meta.role = role;
    } else if (/^use[A-Z]/.test(name)) {
      // React hook — tag for `find_nodes("hook", type: "function")` discoverability
      meta.role = "hook";
    }
    if (feature) meta.feature = feature;
    if (route) meta.route = route;

    const id = nodeId(filePath, name);
    nodes.push({
      id,
      type: nodeType,
      name,
      file_path: filePath,
      code_snippet: snippet(fn.getText()),
      hash: hashContent(fn.getText()),
      meta: serializeMeta(meta),
    });

    edges.push({ from_node: fileNodeId, to_node: id, type: "DEFINES" });

    // ── CALLS edges ──────────────────────────────────────────────────────
    fn.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
      const expr = call.getExpression();
      const calledName = expr.getText().split(".").pop() ?? expr.getText();
      const calledId = nodeId(filePath, calledName);
      if (calledName !== name) {
        edges.push({ from_node: id, to_node: calledId, type: "CALLS" });
      }
    });

    // ── JSX edges (RENDERS, CONTAINS, PART_OF_TAB) ───────────────────────
    if (isComponent) {
      extractJsxEdges(fn, id, name, filePath, nodes, edges, feature);
    }
  }

  // ── Classes ────────────────────────────────────────────────────────────────
  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (!name) continue;

    const id = nodeId(filePath, name);
    const meta: NodeMeta = {};
    if (feature) meta.feature = feature;

    nodes.push({
      id,
      type: "class",
      name,
      file_path: filePath,
      code_snippet: snippet(cls.getText()),
      hash: hashContent(cls.getText()),
      meta: serializeMeta(meta),
    });

    edges.push({ from_node: fileNodeId, to_node: id, type: "DEFINES" });

    const base = cls.getBaseClass();
    if (base) {
      const baseName = base.getName();
      if (baseName) {
        edges.push({ from_node: id, to_node: nodeId(filePath, baseName), type: "EXTENDS" });
      }
    }

    for (const method of cls.getMethods()) {
      const mName = method.getName();
      const mId = nodeId(filePath, `${name}.${mName}`);
      nodes.push({
        id: mId,
        type: "function",
        name: `${name}.${mName}`,
        file_path: filePath,
        code_snippet: snippet(method.getText()),
        hash: hashContent(method.getText()),
      });
      edges.push({ from_node: id, to_node: mId, type: "DEFINES" });
    }
  }

  // ── Interfaces ─────────────────────────────────────────────────────────────
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    const id = nodeId(filePath, name);

    nodes.push({
      id,
      type: "interface",
      name,
      file_path: filePath,
      code_snippet: snippet(iface.getText()),
      hash: hashContent(iface.getText()),
    });

    edges.push({ from_node: fileNodeId, to_node: id, type: "DEFINES" });

    for (const baseExpr of iface.getBaseDeclarations()) {
      const baseName = baseExpr.getName?.();
      if (baseName) {
        edges.push({ from_node: id, to_node: nodeId(filePath, baseName), type: "EXTENDS" });
      }
    }
  }

  // ── Type Aliases ───────────────────────────────────────────────────────────
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    const id = nodeId(filePath, name);

    nodes.push({
      id,
      type: "type_alias",
      name,
      file_path: filePath,
      code_snippet: snippet(typeAlias.getText()),
      hash: hashContent(typeAlias.getText()),
    });

    edges.push({ from_node: fileNodeId, to_node: id, type: "DEFINES" });
  }

  // ── Enums ──────────────────────────────────────────────────────────────────
  for (const enm of sourceFile.getEnums()) {
    const name = enm.getName();
    const id = nodeId(filePath, name);

    nodes.push({
      id,
      type: "enum",
      name,
      file_path: filePath,
      code_snippet: snippet(enm.getText()),
      hash: hashContent(enm.getText()),
    });

    edges.push({ from_node: fileNodeId, to_node: id, type: "DEFINES" });
  }

  // ── Exported Variables & Constants ─────────────────────────────────────────
  for (const varStatement of sourceFile.getVariableStatements()) {
    if (!varStatement.isExported()) continue;

    for (const decl of varStatement.getDeclarations()) {
      const name = decl.getName();
      if (nodes.some((n) => n.name === name && n.type !== "variable")) continue;

      const initializer = decl.getInitializer();
      if (initializer && Node.isArrowFunction(initializer)) continue;

      const id = nodeId(filePath, name);
      if (nodes.some((n) => n.id === id)) continue;

      nodes.push({
        id,
        type: "variable",
        name,
        file_path: filePath,
        code_snippet: snippet(decl.getText()),
        hash: hashContent(decl.getText()),
      });

      edges.push({ from_node: fileNodeId, to_node: id, type: "DEFINES" });
    }
  }

  // ── Imports ────────────────────────────────────────────────────────────────
  for (const imp of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    const impNodeId = nodeId(filePath, `import:${moduleSpecifier}`);

    nodes.push({
      id: impNodeId,
      type: "import",
      name: moduleSpecifier,
      file_path: filePath,
    });

    edges.push({ from_node: fileNodeId, to_node: impNodeId, type: "IMPORTS" });
  }

  // ── Build Summaries ────────────────────────────────────────────────────────
  const fileImports = nodes
    .filter((n) => n.type === "import")
    .map((n) => n.name);

  for (const node of nodes) {
    const meta = node.meta ? JSON.parse(node.meta) : {};
    let summary = "";

    if (node.type === "component") {
      const renderedChildIds = edges
        .filter((e) => e.from_node === node.id && (e.type === "RENDERS" || e.type === "CONTAINS"))
        .map((e) => e.to_node.split("::").pop());
      const uniqueChildren = Array.from(new Set(renderedChildIds));

      const rolePrefix = meta.role ? `UI ${meta.role}` : "UI";
      const tabStr = meta.tab ? ` for tab '${meta.tab}'` : "";
      
      let renderStr = "";
      if (uniqueChildren.length > 0) {
        renderStr = ` that renders ${uniqueChildren.slice(0, 3).join(", ")}${uniqueChildren.length > 3 ? " and others" : ""}`;
      }
      
      summary = `${rolePrefix} component '${node.name}'${tabStr}${renderStr}.`;
      
      if (fileImports.length > 0) {
        const importantImports = fileImports.filter(i => !i.startsWith(".") && !i.includes("react")).slice(0, 2);
        if (importantImports.length > 0) {
          summary += ` Uses ${importantImports.join(", ")}.`;
        }
      }
    } else if (node.type === "function") {
       summary = `Utility function '${node.name}'.`;
    } else if (node.type === "class") {
       summary = `Class '${node.name}'.`;
    } else if (node.type === "route") {
       summary = `Next.js route definition for path '${node.name}'.`;
    } else if (node.type === "interface") {
      // Extract field names from snippet for FTS discoverability
      const fields = (node.code_snippet ?? "")
        .split("\n")
        .filter(l => l.includes(":") && !l.trim().startsWith("interface"))
        .map(l => l.trim().replace(/;$/, "").trim())
        .slice(0, 8);
      summary = fields.length > 0
        ? `Interface '${node.name}' with fields: ${fields.join(", ")}.`
        : `Interface '${node.name}'.`;
    } else if (node.type === "type_alias") {
      const shortCode = (node.code_snippet ?? "").replace(/\n/g, " ").trim();
      summary = shortCode.length < 120
        ? `Type alias: ${shortCode}`
        : `Type alias '${node.name}'.`;
    } else if (node.type === "enum") {
      const members = (node.code_snippet ?? "")
        .split("\n")
        .filter(l => l.trim() && !l.includes("enum") && !l.includes("{") && !l.includes("}"))
        .map(l => l.trim().replace(/,?$/, ""))
        .slice(0, 8);
      summary = members.length > 0
        ? `Enum '${node.name}' with values: ${members.join(", ")}.`
        : `Enum '${node.name}'.`;
    } else if (node.type === "file") {
      // Behavioral summary: list the main symbols the file defines
      const definedSymbols = nodes
        .filter(n => n.id !== node.id && n.type !== "import")
        .map(n => `${n.name}(${n.type})`)
        .slice(0, 6);
      const featureStr = meta.feature ? ` Feature: ${meta.feature}.` : "";
      summary = definedSymbols.length > 0
        ? `File '${fileName}' defining ${definedSymbols.join(", ")}.${featureStr}`
        : `File '${fileName}'.${featureStr}`;
    }

    if (summary) {
      node.summary = summary;
    }
  }

  return { nodes, edges, hash: fileHash };
}

// ───── JSX Edge Extraction + Tab System Detection ────────────────────────────

/**
 * Extract RENDERS, CONTAINS, and PART_OF_TAB edges from JSX.
 *
 * Tab system detection:
 *   <TabsContent value="templates"><ScriptsPanel /></TabsContent>
 *   → ScriptsPanel PART_OF_TAB "templates"
 *   → ScriptsPanel meta.tab = "templates"
 */
function extractJsxEdges(
  fnNode: Node,
  parentId: string,
  parentName: string,
  filePath: string,
  nodes: ParsedNode[],
  edges: ParsedEdge[],
  feature?: string,
): void {
  const seenRenders = new Set<string>();

  // ── RENDERS: all PascalCase JSX elements ───────────────────────────────
  const selfClosing = fnNode.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  for (const el of selfClosing) {
    const tagName = el.getTagNameNode().getText();
    if (!isPascalCase(tagName) || tagName === parentName) continue;
    const targetId = nodeId(filePath, tagName);
    if (!seenRenders.has(targetId)) {
      edges.push({ from_node: parentId, to_node: targetId, type: "RENDERS" });
      seenRenders.add(targetId);
    }
  }

  const openingElements = fnNode.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
  for (const el of openingElements) {
    const tagName = el.getTagNameNode().getText();
    if (!isPascalCase(tagName) || tagName === parentName) continue;
    const targetId = nodeId(filePath, tagName);
    if (!seenRenders.has(targetId)) {
      edges.push({ from_node: parentId, to_node: targetId, type: "RENDERS" });
      seenRenders.add(targetId);
    }
  }

  // ── CONTAINS + PART_OF_TAB: direct parent-child + tab detection ────────
  const jsxElements = fnNode.getDescendantsOfKind(SyntaxKind.JsxElement);
  for (const el of jsxElements) {
    const openingEl = el.getOpeningElement();
    const outerTag = openingEl.getTagNameNode().getText();
    if (!isPascalCase(outerTag)) continue;
    const wrapperId = nodeId(filePath, outerTag);

    // Detect tab value: <TabsContent value="xxx"> or <TabsTrigger value="xxx">
    const isTabContainer = /^(TabsContent|TabContent|TabPanel)$/i.test(outerTag);
    let tabValue: string | undefined;
    if (isTabContainer) {
      tabValue = getJsxAttributeValue(openingEl, "value");
    }

    // Look at direct children
    for (const child of el.getJsxChildren()) {
      let childTag: string | undefined;

      if (Node.isJsxElement(child)) {
        childTag = child.getOpeningElement().getTagNameNode().getText();
      } else if (Node.isJsxSelfClosingElement(child)) {
        childTag = child.getTagNameNode().getText();
      }

      if (!childTag || !isPascalCase(childTag)) continue;
      const childId = nodeId(filePath, childTag);
      edges.push({ from_node: wrapperId, to_node: childId, type: "CONTAINS" });

      // ── PART_OF_TAB: if inside a TabsContent with a value ──────────
      if (tabValue) {
        edges.push({ from_node: childId, to_node: parentId, type: "PART_OF_TAB" });

        // Update the child node's meta with tab info
        const childNode = nodes.find((n) => n.name === childTag);
        if (childNode) {
          const existing: NodeMeta = childNode.meta ? JSON.parse(childNode.meta) : {};
          existing.tab = tabValue;
          if (feature) existing.feature = feature;
          childNode.meta = JSON.stringify(existing);
        }
      }
    }
  }
}

/** Extract a string attribute value from a JSX opening element */
function getJsxAttributeValue(
  openingElement: Node,
  attrName: string,
): string | undefined {
  const attrs = openingElement.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of attrs) {
    const name = attr.getFirstChildByKind(SyntaxKind.Identifier);
    if (name?.getText() !== attrName) continue;
    const initializer = attr.getFirstChildByKind(SyntaxKind.StringLiteral);
    if (initializer) return initializer.getLiteralText();
  }
  return undefined;
}

let removeCount = 0;

export function removeFile(filePath: string): void {
  const sourceFile = project.getSourceFile(filePath);
  if (sourceFile) project.removeSourceFile(sourceFile);

  if (++removeCount % 50 === 0) {
    project
      .getSourceFiles()
      .filter((f) => !existsSync(f.getFilePath()))
      .forEach((f) => project.removeSourceFile(f));
  }
}
