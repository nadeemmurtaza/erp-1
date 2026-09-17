"""Find a bordered element rendered inside another bordered element.

Two borders a few pixels apart say nothing the outer one did not already
say, and the reader sees a seam rather than a boundary. This walks each
file's JSX by indentation and reports any bordered open tag that has a
bordered ancestor still open.

Crude — it trusts indentation rather than parsing JSX — but it is the same
crude rule everywhere, which is what makes the list comparable.
"""
import glob
import io
import re

# What counts as drawing a box.
BORDERED = re.compile(r'\b(card|border(?!-0)(?:-[trblxy])?(?:\s|")|border-neutral|border-\w+-\d+)')
OPEN_TAG = re.compile(r'^(\s*)<(\w+)[^>]*className="([^"]*)"')
CLOSE_TAG = re.compile(r'^(\s*)</(\w+)>')

# A border that genuinely separates rather than wraps.
EDGE_ONLY = re.compile(r'border-[trblxy]\b|border-b\b|border-t\b|border-s\b|border-e\b|divide-')

hits = []

for path in sorted(glob.glob('apps/web/src/**/*.tsx', recursive=True)):
    src = io.open(path, encoding='utf-8', errors='replace').read()
    stack = []  # (indent, line_no, classes)

    for i, line in enumerate(src.split('\n'), 1):
        close = CLOSE_TAG.match(line)
        if close:
            indent = len(close.group(1))
            while stack and stack[-1][0] >= indent:
                stack.pop()
            continue

        m = OPEN_TAG.match(line)
        if not m:
            continue

        indent, _tag, classes = len(m.group(1)), m.group(2), m.group(3)
        while stack and stack[-1][0] >= indent:
            stack.pop()

        boxed = bool(BORDERED.search(classes)) and not EDGE_ONLY.search(classes)
        if boxed:
            if stack:
                outer = stack[-1]
                hits.append((path.replace('apps/web/src/', ''), outer[1], i,
                             outer[2][:42], classes[:42]))
            stack.append((indent, i, classes))

for path, outer_line, inner_line, outer, inner in hits:
    print('%s' % path)
    print('    outer :%-4d %s' % (outer_line, outer))
    print('    inner :%-4d %s' % (inner_line, inner))

print('\nnested bordered elements: %d' % len(hits))
