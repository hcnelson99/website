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
        var roll = randint(0, 5);
        board.push(big_cubes[indices[i]][roll]);
    }

    return board;
}

function hide_board(board) {
    var boggle = document.getElementById("boggle");
    for (var i = 0; i < N; i++) {
        boggle.children[i].innerText = "";
    }
}

function render_board(board) {
    var boggle = document.getElementById("boggle");
    for (var i = 0; i < N; i++) {
        boggle.children[i].innerText = board[i];
    }
}

// The output of this has been cached in dict.js
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

var board;

var url_params = new URLSearchParams(window.location.search);
if (url_params.has("board")) {
    board = atob(url_params.get("board")).split(",");
} else {
    board = gen_board();
}

var words = search(board);

function set_url(url_box) {
    var code = btoa(board.join());
    var url_base = window.location.href.split("?")[0];
    url_box.value = url_base + "?board=" + code;
}

function delete_all_children(node) {
    while (node.firstChild) {
        node.removeChild(node.lastChild);
    }
}

var answers;

function show_answers(scored_words) {
    render_board(board);

    if (answers.children.length > 0) {
        return;
    }

    var sorted_words = Object.keys(words);
    sorted_words.sort(function (x, y) {
        if (x.length != y.length) {
            return y.length - x.length;
        }
        if (x < y) {
            return -1;
        } else if (x > y) {
            return 1;
        } else {
            return 0;
        }
    });

    var max_score = 0;
    for (var i = 0; i < sorted_words.length; i++) {
        max_score += score_word(sorted_words[i]);
    }

    var p = document.createElement("p");
    p.appendChild(document.createTextNode("Maximum Score: " + max_score));
    answers.appendChild(p);

    var word_answer_list = document.createElement("ul");

    for (var i = 0; i < sorted_words.length; i++) {
        var word = sorted_words[i];

        var li = document.createElement("li");
        li.appendChild(document.createTextNode(word + " - " + dict[word]));
        if (word in scored_words) {
            li.style["text-decoration"] = "line-through";
            li.style.color = "grey";
        }
        word_answer_list.appendChild(li);
    }

    answers.appendChild(word_answer_list);
}

function hide_answers() {
    delete_all_children(document.getElementById("answers"));
}

window.onload = function () {
    var reveal_board = document.getElementById("reveal-board");
    var form = document.getElementById("word-form");
    var input = document.getElementById("word-input");
    var score_display = document.getElementById("total-score");
    var word_list = document.getElementById("word-list");
    var url_box = document.getElementById("url-box");
    var new_board = document.getElementById("new-board");
    var show_answers_button = document.getElementById("show-answers");
    answers = document.getElementById("answers");

    set_url(url_box);

    reveal_board.onclick = function () {
        render_board(board);
        input.focus();
    };

    var score = 0;
    var scored_words = {};

    function set_score(x) {
        score = x;
        score_display.innerText = score;
    }

    new_board.onclick = function () {
        board = gen_board();
        hide_board();
        set_url(url_box);
        set_score(0);
        scored_words = {};
        words = search(board);
        delete_all_children(word_list);
        hide_answers();
    };

    show_answers_button.onclick = function () {
        show_answers(scored_words);
    };

    form.onsubmit = function (event) {
        event.preventDefault();

        if (answers.children.length > 0) {
            return false;
        }

        var word = input.value.toLowerCase();

        if (word in words && !(word in scored_words)) {
            var word_score = score_word(word);
            set_score(score + word_score);
            scored_words[word] = true;

            var li = document.createElement("li");
            li.appendChild(document.createTextNode(word));
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;

            checkbox.onclick = function () {
                if (checkbox.checked) {
                    set_score(score + word_score);
                    li.style.color = null;
                } else {
                    set_score(score - word_score);
                    li.style.color = "grey";
                }
            };

            li.appendChild(checkbox);

            if (word_list.children.length == 0) {
                word_list.appendChild(li);
            } else {
                for (var i = 0; i < word_list.children.length; i++) {
                    if (word < word_list.children[i].innerText) {
                        word_list.insertBefore(li, word_list.children[i]);
                        break;
                    }
                }
            }
        }

        input.value = "";
        return false;
    };
};
