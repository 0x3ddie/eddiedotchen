// A citation check you can rerun: do assistants bring up Eddie's work when
// someone asks a question it answers?
//
//   npm run citation-check                  list the questions to ask
//   npm run citation-check -- new [date]    create a folder for a run's answers
//   npm run citation-check -- score [date]  score a run and compare with the previous one
//
// It calls no APIs and needs no keys. You ask each assistant each question
// (fresh chat, web search on) and paste the whole answer, sources included, into
// citation-check/<date>/answers/<assistant>/<question-id>.txt. The answers are
// gitignored, because they quote other people's pages; the scored summary.md of
// each run is what gets committed. Scoring is plain string matching, so the
// numbers mean exactly what they say:
//   2  the answer links eddiechen.xyz
//   1  the answer names his work or his GitHub, without linking the site
//   0  neither
//   -  not asked

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RUNS = path.join(ROOT, "citation-check");
const { assistants, questions } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "citation-check", "questions.json"), "utf8")
);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "site.json"), "utf8"));
const siteHost = new URL(site.url).host.replace(/\./g, "\\.");

const today = () => new Date().toISOString().slice(0, 10);
const runDirs = () =>
  fs.existsSync(RUNS)
    ? fs.readdirSync(RUNS).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort()
    : [];

function list() {
  console.log("Ask each of these in a fresh chat with web search on:\n");
  for (const q of questions) console.log(`[${q.id}]\n${q.question}\n(should surface: ${q.target})\n`);
  console.log(`Assistants: ${assistants.join(", ")}`);
}

function create(date) {
  for (const assistant of assistants) {
    fs.mkdirSync(path.join(RUNS, date, "answers", assistant), { recursive: true });
  }
  console.log(`Created citation-check/${date}/answers/<assistant>/ for: ${assistants.join(", ")}`);
  console.log(`Save each answer as <question-id>.txt, then run: npm run citation-check -- score ${date}`);
}

function scoreAnswer(question, text) {
  if (new RegExp(siteHost, "i").test(text)) return 2;
  return question.evidence.some((pattern) => new RegExp(pattern, "i").test(text)) ? 1 : 0;
}

function scoreRun(date) {
  const answers = path.join(RUNS, date, "answers");
  if (!fs.existsSync(answers)) return null;
  const present = fs.readdirSync(answers).filter((d) => fs.statSync(path.join(answers, d)).isDirectory());
  const scores = {};
  for (const assistant of present) {
    scores[assistant] = {};
    for (const q of questions) {
      const file = path.join(answers, assistant, `${q.id}.txt`);
      scores[assistant][q.id] = fs.existsSync(file) ? scoreAnswer(q, fs.readFileSync(file, "utf8")) : null;
    }
  }
  return scores;
}

const cell = (value) => (value === null || value === undefined ? "-" : String(value));

function totals(scores) {
  const asked = Object.values(scores).flatMap((row) => Object.values(row)).filter((v) => v !== null);
  return {
    asked: asked.length,
    linked: asked.filter((v) => v === 2).length,
    named: asked.filter((v) => v === 1).length,
  };
}

// Totals of an earlier run, from its answers if they are here, else its summary.
function previousTotals(date) {
  const scores = scoreRun(date);
  if (scores) return totals(scores);
  const summary = path.join(RUNS, date, "summary.md");
  if (!fs.existsSync(summary)) return null;
  const m = /Answers checked: (\d+)\. Linking the site: (\d+)\. Naming his work without the site: (\d+)\./.exec(
    fs.readFileSync(summary, "utf8")
  );
  return m ? { asked: Number(m[1]), linked: Number(m[2]), named: Number(m[3]) } : null;
}

function score(date) {
  const scores = scoreRun(date);
  if (!scores) throw new Error(`no answers at citation-check/${date}/answers`);
  const columns = Object.keys(scores);
  const previousDate = runDirs().filter((d) => d < date).pop();
  const then = previousDate ? previousTotals(previousDate) : null;

  const lines = [
    `# Citation check, ${date}`,
    "",
    "2 = links eddiechen.xyz · 1 = names his work or GitHub · 0 = neither · - = not asked",
    "",
    `| question | ${columns.join(" | ")} |`,
    `|---|${columns.map(() => "---").join("|")}|`,
    ...questions.map((q) => `| ${q.id} | ${columns.map((a) => cell(scores[a][q.id])).join(" | ")} |`),
    "",
  ];
  const now = totals(scores);
  lines.push(`Answers checked: ${now.asked}. Linking the site: ${now.linked}. Naming his work without the site: ${now.named}.`);
  if (then) {
    lines.push(`Previous run (${previousDate}): ${then.asked} checked, ${then.linked} linking the site, ${then.named} naming his work.`);
  }
  const report = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(RUNS, date, "summary.md"), report);
  console.log(report);
}

const [command = "list", dateArg] = process.argv.slice(2);
if (command === "list") list();
else if (command === "new") create(dateArg || today());
else if (command === "score") score(dateArg || runDirs().pop() || today());
else {
  console.error("usage: citation-check [list | new [date] | score [date]]");
  process.exit(1);
}
