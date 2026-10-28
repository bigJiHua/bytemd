// ASCII makes byte sizes deterministic without cutting UTF-8 sequences.
export function performanceFixture(kib, enhanced = false) {
  const target = kib * 1024
  const chunks = ['# Long document\n\n']
  let bytes = chunks[0].length
  let sections = 0
  const expected = { math: 0, highlight: 0, mermaid: 0 }
  while (true) {
    const i = sections + 1
    let unit = `## Section ${i}\n\nParagraph with **bold**, *emphasis*, \`code\`, [link](#long-document), [size=20]large[/size] and [color=#123456]color[/color].\n\n`
    if (i % 8 === 0) unit += '> [!NOTE]\n> Supporting information.\n\n'
    if (i % 16 === 0) unit += '+++ Details\n**Nested content**\n+++\n\n'
    if (enhanced && i % 8 === 0) {
      unit +=
        '```js\nconst value = [1, 2, 3].map(x => x * 2);\nconsole.log(value);\n```\n\nFormula: $\\frac{x^2 + 1}{y}$ and $\\sqrt{a^2+b^2}$.\n\n'
    }
    if (enhanced && i <= 3) {
      unit += `\`\`\`mermaid\ngraph LR\nA[Input ${i}]-->B[Output]\n\`\`\`\n\n`
    }
    if (bytes + unit.length + 32 > target) break
    chunks.push(unit)
    bytes += unit.length
    sections++
    if (enhanced && i % 8 === 0) {
      expected.math += 2
      expected.highlight++
    }
    if (enhanced && i <= 3) expected.mermaid++
  }
  const tail = '\n\nEnd of document.\n'
  chunks.push('x'.repeat(target - bytes - tail.length), tail)
  return { markdown: chunks.join(''), bytes: target, sections, expected }
}
