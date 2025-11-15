import os


class HtmlBuilder:
    def __init__(self):
        self._contents = []
        self._indentation_level = 0

    def t(self, text):
        for line in text.splitlines():
            self._contents.append(' ' * self._indentation_level + line)

    def __call__(self, tag):
        class With:
            def __enter__(w):
                self.t('<' + tag + '>')
                self._indentation_level += 1

            def __exit__(w, *_):
                self._indentation_level -= 1
                self.t('</' + tag + '>')

        return With()

    def contents(self):
        return '\n'.join(self._contents)

if __name__ == '__main__':
    path = os.path.abspath(__file__)
    gen_dir = os.path.dirname(path)

    post = open(gen_dir + '/posts/01-values.md')

    h = HtmlBuilder()

    with h('html'):
        with h('head'):
            with h('title'):
                h.t('This is the title')
        with h('body'):
            with h('h1'):
                h.t('This is the header')
            with h('p'):
                h.t('This is the paragraph contents')

    print(h.contents())


