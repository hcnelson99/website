import json
import io
import re

regex = re.compile('[^a-zA-Z]')

b = json.load(io.open('en_kjv.json', 'r', encoding='utf-8-sig'))

d = {}

for book in b:
    book_name = book['name']
    for ci, chapter in enumerate(book['chapters']):
        for li, line in enumerate(chapter):
            line_string = book_name + ' ' + str(ci + 1) + ':' + str(li + 1) + ': ' + line

            words = line.split()
            for word in words:
                word = regex.sub('', word).lower()
                if word not in d:
                    d[word] = line_string
print(json.dumps(d))
