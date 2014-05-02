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

Ink.requireModules(['Ink.Dom.Event_1','Ink.Ext.Ghink_1'],function( Event, GhinkObject ){

    var Ghink=new GhinkObject;

    Event.observe(window, 'load', function(e) {
        Ghink.init();
        Ghink.prettifyer();
        Ghink.menuSelectItems();
        Ghink.printRandomPosts(posts,{{ site.blog_more_posts }});
    });

});
