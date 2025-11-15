import os, re
from collections import defaultdict
import time

class HtmlBuilder:
    def __init__(self):
        self._contents = []
        self._indentation_level = 0

    def s(self, text):
        for line in text.splitlines():
            self._contents.append(' ' * self._indentation_level + line)

    def empty_element(self, tag, **kwargs):
        attrs = ' '.join([ a + '="' + v +'"' for a, v in kwargs.items()])
        if attrs != '': attrs = ' ' + attrs
        self.s('<' + tag + attrs + '>')

    def open(self, tag, **kwargs):
        self.empty_element(tag, **kwargs)
        self._indentation_level += 1

    def close(self, tag):
        self._indentation_level -= 1
        self.s('</' + tag + '>')

    def __call__(self, tag, **kwargs):
        class With:
            def __enter__(w):
                self.open(tag, **kwargs)

            def __exit__(w, *_):
                self.close(tag)

        return With()

    def contents(self):
        return '\n'.join(self._contents)


def markdown(text):
    h = HtmlBuilder()

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

    return h.contents()

if __name__ == '__main__':
    while True:
        path = os.path.abspath(__file__)
        gen_dir = os.path.dirname(path)

        post = open(gen_dir + '/posts/01-values.md').read()
        css = open(gen_dir + '/posts/01-values.css').read()
        js = open(gen_dir + '/posts/01-values.js').read()

        h = HtmlBuilder()

        h.s('<!DOCTYPE html>')
        with h('html', lang='en'):
            with h('head'):
                h.empty_element('meta', charset='UTF-8')
                h.empty_element('meta', name="viewport", content="width=device-width, initial-scale=1.0")
                with h('title'):
                    h.s('This is the title')
                with h('style'):
                    h.s(css)
                with h('script'):
                    h.s(js)
            with h('body'):
                with h('h1'):
                    h.s('Values')

                h.s(markdown(post))

        open(gen_dir + '/../posts/values.html', 'w').write(h.contents())

        time.sleep(0.5)
