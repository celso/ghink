Ink.createExt('Ghink', 1, ['Ink.Dom.Browser_1'], function( Browser ) {

    var Ghink = function() {
        this.init();
    }; 

    Ghink.prototype = {
        init: function() {
            // Fadein all the "fadein" classes
            var fades = document.getElementsByClassName("fadein");
            for (var i = fades.length - 1; i >= 0; i--) this.fade(fades[i]);
            // initialize map
            if(typeof(initMap)!=="undefined") initMap();
        },

        shuffle: function(o) {
            for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
            return o;
        },

        fade: function(e) {
            var op = 0;  // initial opacity
            e.style.opacity = 0;
            e.style.filter = 'alpha(opacity=0)';
            e.style.visibility="visible";
            var timer = setInterval(function () {
                if (op >= 1){
                    clearInterval(timer);
                }
                op += 0.1;
                e.style.opacity = op;
                e.style.filter = 'alpha(opacity=' + op * 100 + ")";
            }, 50);
        },

        // Marks menu items as active if they match the data-urlexp attribute
        menuSelectItems: function() {
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
        },

        // Code prettifyer
        prettifyer: function() {

            var codes = document.getElementsByClassName("highlight");
            for (var i = codes.length - 1; i >= 0; i--) {
                for (var j = codes[i].childNodes.length - 1; j >= 0; j--) {
                    if(codes[i].childNodes[j].tagName==='PRE') {
                        codes[i].childNodes[j].className = 'prettyprint';
                    }
                }
            }

            try {
                prettyPrint();
            }
            catch(err) {
            }

        },

        // Print related posts
        printRandomPosts: function(posts,num) {
            var prs=[];
            var pc=0;
            var elm = Ink.i('relatedposts');
            if(elm) {
                var html='';
                var rposts=this.shuffle(posts);
                for(var i=0;i<rposts.length && pc<num;i++) {
                    var post=rposts[i];
                    if(post.thumbnail && post.thumbnail.length && window.location.pathname !== post.url) {
                            html+='<a href="'+post.url+'"><h5>'+post.title+'</h5><img src="'+post.thumbnail+'"><br/><small>'+post.excerpt+'</small></a>';
                            pc++;
                    }
                }
                elm.innerHTML=html;
            }
        }


    };

    return Ghink; 
});
