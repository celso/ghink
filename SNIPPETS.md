Snippets
========

Snippets are basically Jekyll includes that you can use for displaying common web elements, like Youtube videos, or Disqus comments, or Leaflet maps, with only a few simple options, without worrying about their APIs or CSS styles. They just work.

To use a snippet in a page or blog post, you just need to write this inline:

```
{% include snippet.html option="value" %}
```

Available snippets
------------------

> {% include youtube.html id="video_id" autoplay="1|0" controls="1|0" %}

 - `autoplay` and `controls` are optional
 - `id` is the Youtube video id

Example:

```
{% include youtube.html id="YE7VzlLtp-4" autoplay="1" controls="0" %}
```

