Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}

function menuSelectItems() {
    var menus = document.getElementsByClassName("menu");
    for (var j=0; j < menus.length; j++) {
        var items = menus[j].getElementsByTagName('li');
        for (var i = 0; i < items.length; i++) {
            var re = items[i].getAttribute('data-urlexp');
            if( re && window.location.pathname.search(eval(re))!==-1) {
                items[i].className = 'active';
                return;
            }
        }
    }
}

function OnLoadTasks() {
    // Prettifyer
    prettyPrint();
    // Marks menu items as active if they match the data-urlexp attribute
    menuSelectItems();
}

window.onload=OnLoadTasks;