"use strict";

var big_cubes = [
    ["A", "A", "A", "F", "R", "S"],
    ["A", "A", "E", "E", "E", "E"],
    ["A", "A", "F", "I", "R", "S"],
    ["A", "D", "E", "N", "N", "N"],
    ["A", "E", "E", "E", "E", "M"],
    ["A", "E", "E", "G", "M", "U"],
    ["A", "E", "G", "M", "N", "N"],
    ["A", "F", "I", "R", "S", "Y"],
    ["B", "J", "K", "Qu", "X", "Z"],
    ["C", "C", "E", "N", "S", "T"],
    ["C", "E", "I", "I", "L", "T"],
    ["C", "E", "I", "L", "P", "T"],
    ["C", "E", "I", "P", "S", "T"],
    ["D", "D", "H", "N", "O", "T"],
    ["D", "H", "H", "L", "O", "R"],
    ["D", "H", "L", "N", "O", "R"],
    ["D", "H", "L", "N", "O", "R"], // (DUPLICATE)
    ["E", "I", "I", "I", "T", "T"],
    ["E", "M", "O", "T", "T", "T"],
    ["E", "N", "S", "S", "S", "U"],
    ["F", "I", "P", "R", "S", "Y"],
    ["G", "O", "R", "R", "V", "W"],
    ["I", "P", "R", "R", "R", "Y"],
    ["N", "O", "O", "T", "U", "W"],
    ["O", "O", "O", "T", "T", "U"],
];

function randint(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = randint(0, i);
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

var S = 5;
var N = S * S;

function gen_board() {
    var indices = [];
    for (var i = 0; i < N; i++) {
        indices.push(i);
    }
    shuffle(indices);

    var board = [];
    for (var i = 0; i < N; i++) {
        var roll = randint(0, S - 1);
        board.push(big_cubes[indices[i]][roll]);
    }

    return board;
}

function render_board(board) {
    var boggle = document.getElementById("boggle");
    for (var i = 0; i < N; i++) {
        boggle.children[i].innerText = board[i];
    }
}

function build_trie(words) {
    var trie = {};

    for (var i = 0; i < words.length; i++) {
        var trie_finger = trie;
        var word = words[i];
        for (var j = 0; j < word.length; j++) {
            if (!(word[j] in trie_finger)) {
                trie_finger[word[j]] = {};
            }
            trie_finger = trie_finger[word[j]];
            if (j == word.length - 1) {
                trie_finger.terminal = word;
            }
        }
    }

    return trie;
}

function get_dictionary() {
    var request = new XMLHttpRequest();
    request.open("GET", "/words.txt", false);
    request.send();
    if (request.status == 200) {
        var all_words = request.responseText.split("\n");
        var words = [];
        for (var i = 0; i < all_words.length; i++) {
            if (all_words[i].length >= 4) {
                words.push(all_words[i]);
            }
        }
        return words;
    } else {
        alert("Could not load word list");
    }
}

var dict = get_dictionary();

var trie = build_trie(get_dictionary());

function adj(i) {
    var row = Math.floor(i / S);
    var col = i % S;
    var res = [];
    for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
            if (dr == 0 && dc == 0) {
                continue;
            }
            var nrow = row + dr;
            var ncol = col + dc;
            if (0 <= nrow && nrow < S && 0 <= ncol && ncol < S) {
                res.push(nrow * 5 + ncol);
            }
        }
    }
    return res;
}

function searchHelper(board, trie, res, visited, pos) {
    if (visited.includes(pos)) {
        return;
    }

    var letters = board[pos].toLowerCase();

    for (var i = 0; i < letters.length; i++) {
        var letter = letters[i];
        if (!(letter in trie)) {
            return;
        }
        trie = trie[letter];
    }

    visited.push(pos);

    if (trie.terminal) {
        res[trie.terminal] = true;
    }

    var adjs = adj(pos);
    for (var i = 0; i < adjs.length; i++) {
        var a = adjs[i];
        searchHelper(board, trie, res, visited, a);
    }

    visited.pop();
}

function search(board) {
    var res = {};
    for (var i = 0; i < 25; i++) {
        searchHelper(board, trie, res, [], i);
    }
    return res;
}

function score_word(word) {
    if (word.length < 4) {
        alert("Invalid word");
    } else if (word.length == 4) {
        return 1;
    } else if (word.length == 5) {
        return 2;
    } else if (word.length == 6) {
        return 3;
    } else if (word.length == 7) {
        return 5;
    } else if (word.length >= 8) {
        return 11;
    }
}

window.onload = function () {
    var board = gen_board();
    var words = search(board);
    render_board(board);

    var form = document.getElementById("word-form");
    var input = document.getElementById("word-input");
    var score_display = document.getElementById("total-score");
    var word_list = document.getElementById("word-list");

    var score = 0;
    var scored_words = {};

    form.onsubmit = function (event) {
        event.preventDefault();
        var word = input.value;

        if (word in words && !(word in scored_words)) {
            score += score_word(word);
            score_display.innerText = score;
            scored_words[word] = true;

            var li = document.createElement("li");
            li.appendChild(document.createTextNode(word));
            word_list.appendChild(li);
        }

        input.value = "";
        return false;
    };
};
