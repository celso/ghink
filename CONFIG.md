_config.yml
===========

The [_config.yml][2] file is at the center of your website behavior and features. It's used both to configure the [Jekyll][1] parser and a bunch of local website parameters.

Beware that sometimes, under unclear circumstances to me, Jekyll won't reprocess the website correctly when running with the --match flag. If you change to _config.yml file, you are advised to stop and restart Jekyll.

Local parameters
----------------

> disqus_shortname: "shortname"

If you want to use [Disqus][3] comments in your website blog posts, all you need is to set the `disqus_shortname` variable with the Disqus shortname for your Website.

> use_leaflet: 1

Leaflet is a modern open-source JavaScript library for mobile-friendly interactive maps. It is developed by Vladimir Agafonkin with a team of dedicated contributors. Weighing just about 31 KB of JS, it has all the features most developers ever need for online maps.

Ghink has a leaflet snippet you can use in your pages or blog posts. If you will be using it, you must set `use_leaflet: 1`.

> ga_domain: "domain.org"  
> ga_id: "UA-123456789-0"  

If you set these, [Google Analytics][5] will be used with all your pages. Get your `ga_id` Tracking ID and `ga_domain` url in your Tracking Info, Tracking Code at the Google Analytics admin page. It looks this this:

```
<script>
...
  ga('create', 'UA-123456789-0', 'domain.org');
...
</script>
```

> blog_more_posts: 5

This sets the number of "more posts" that appear on the left column of a blog article. If value is 0, the left column disappears.

> prettify_theme: "theme_name"

Defines the Google Prettify theme to use for code highlighting. The bundled themes are:

- desert
- ghink (default)
- ghink2
- solarized-dark
- solarized-light
- tomorrow-night-blue
- tomorrow-night-eighties
- tomorrow
- vibrant-ink

To write code on a page, use the following markdown syntax:

> &#96;&#96;&#96;  
> var code = 42;  
> &#96;&#96;&#96;  



 [1]: 	http://jekyllrb.com/docs/configuration/
 [2]:	https://github.com/celso/ghink/blob/gh-pages/_config.yml
 [3]:	http://disqus.com
 [4]:	http://leafletjs.com
 [5]:	http://www.google.com/analytics/