---
title: Javascript file
---
Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
};

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
};

function OnLoadTasks() {
    // Prettifyer
    var codes = document.getElementsByClassName("highlight");
    for (var i = codes.length - 1; i >= 0; i--) {
        for (var j = codes[i].childNodes.length - 1; j >= 0; j--) {
            if(codes[i].childNodes[j].tagName==='PRE') {
                codes[i].childNodes[j].className = 'prettyprint';
            }
        }
    }
    prettyPrint();
    // Marks menu items as active if they match the data-urlexp attribute
    menuSelectItems();
    // Print related posts
    printRandomPosts(posts,{{ site.blog_more_posts }});
    // initialize map
    if(typeof(initMap)!=="undefined") initMap();
    // Fadein all the "fadein" classes
    var fades = document.getElementsByClassName("fadein");
    for (var i = fades.length - 1; i >= 0; i--) fade(fades[i]);
};

function printRandomPosts(posts,num) {
    var prs=[];
    var pc=0;
    var elm = document.getElementById('relatedposts');
    if(elm) {
        var html='';
        var rposts=shuffle(posts);
        for(var i=0;i<rposts.length && pc<num;i++) {
            var post=rposts[i];
            if(post.thumbnail && post.thumbnail.length && window.location.pathname !== post.url) {
                    html+='<a href="'+post.url+'"><h5>'+post.title+'</h5><img src="'+post.thumbnail+'"><small>'+post.excerpt+'</small></a>';
                    pc++;
            }
        }
        elm.innerHTML=html;
    }
};

function fade(element) {
    var op = 0;  // initial opacity
    element.style.opacity = 0;
    element.style.filter = 'alpha(opacity=0)';
    element.style.visibility="visible";
    var timer = setInterval(function () {
        if (op >= 1){
            clearInterval(timer);
        }
        op += 0.1;
        element.style.opacity = op;
        element.style.filter = 'alpha(opacity=' + op * 100 + ")";
    }, 50);
};

function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
};

window.onload=OnLoadTasks;