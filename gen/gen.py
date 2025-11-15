import os, re
from collections import defaultdict

class HtmlBuilder:
    def __init__(self):
        self._contents = []
        self._indentation_level = 0

    def s(self, text):
        for line in text.splitlines():
            self._contents.append(' ' * self._indentation_level + line)

    def open(self, tag):
        self.s('<' + tag + '>')
        self._indentation_level += 1

    def close(self, tag):
        self._indentation_level -= 1
        self.s('</' + tag + '>')

    def __call__(self, tag):
        class With:
            def __enter__(w):
                self.open(tag)

            def __exit__(w, *_):
                self.close(tag)

        return With()

    def contents(self):
        return '\n'.join(self._contents)


def markdown(h, text):
    paragraph = []
    tag = None

    def open_if_not(t):
        nonlocal tag
        if tag != t:
            assert tag == None
            tag = t
            h.open(tag)

    def close():
        nonlocal paragraph, tag
        if tag:
            h.close(tag)
            tag = None

        if paragraph != []:
            with h('p'):
                for l in paragraph:
                    h.s(l)
            paragraph = []

    for line in text.splitlines():
        if line == '':
            close()
        elif line.startswith('- '):
            open_if_not('ul')
            with h('li'):
                h.s(line.removeprefix('- '))
        elif m := re.search(r'[0-9]+\. ', line):
            open_if_not('ol')
            with h('li'):
                h.s(line[m.end():])
        else:
            paragraph.append(line)

    close()

if __name__ == '__main__':
    path = os.path.abspath(__file__)
    gen_dir = os.path.dirname(path)

    post = open(gen_dir + '/posts/01-values.md').read()

    h = HtmlBuilder()

    with h('html'):
        with h('head'):
            with h('title'):
                h.s('This is the title')
        with h('body'):
            with h('h1'):
                h.s('Values')

            markdown(h, post)

    open(gen_dir + '/../posts/values.html', 'w').write(h.contents())
