function onload() {
    const selectedList = document.getElementsByTagName('ol')[0];
    var removedList = null;

    function click(evt) {
        const li = this.parentNode.parentNode;
        if (li.parentNode == selectedList) {
            selectedList.removeChild(li);
            if (removedList == null) {
                removedList = document.createElement('ul');
                const p = document.createElement('p');
                p.innerText = 'Removed Values';
                const body = document.getElementsByTagName('body')[0];
                body.append(p);
                body.append(removedList);
            }
            this.innerText = '↺';
            removedList.prepend(li);
        } else {
            removedList.removeChild(li);
            this.innerText = '×';
            selectedList.append(li);
        }
    }

    for (const li of selectedList.children) {
        const span = document.createElement('span');
        span.innerText = li.innerText;
        const button = document.createElement('button');
        button.innerText = '×';
        button.addEventListener('click', click);
        const div = document.createElement('div');
        div.append(span);
        div.append(button);
        li.innerText = '';
        li.append(div);
    }
}

window.addEventListener('load', onload);
