Snippets
========

Snippets are basically Jekyll includes that you can use for displaying common web elements, like Youtube videos, or Disqus comments, or Leaflet maps, with only a few simple options, without worrying about their APIs or CSS styles. They just work.

To use a snippet in a page or blog post, you just need to write this inline:

```
{% include snippet.html option="value" %}
```

Available snippets
------------------

### Youtube

> {% include youtube.html id="video_id" autoplay="1|0" controls="1|0" %}

 - `autoplay` and `controls` are optional
 - `id` is the Youtube video id

Example:

```
{% include youtube.html id="YE7VzlLtp-4" autoplay="1" controls="0" %}
```

### Vimeo

> {% include vimeo.html id="video_id" autoplay="1|0" loop="1|0" %}

 - `autoplay` and `loop` are optional
 - `id` is the Vimeo video id

Example:

```
{% include vimeo.html id="1084537" autoplay="1" loop="1" %}
```

### SAPO Videos

> {% include sapovideos.html id="video_id" %}

 - `id` is the SAPO video id

Example:

```
{% include sapovideos.html id="EUEF2ZiY5RqHoevCHYzt" %}
```

### Leaflet map

> {% include leaflet.html height="400" coords="lat, lon" zoom="15" provider="System.type" marker_coords="lat, lon" marker_title="Marker title" %}

- `marker_coords` and `marker_title` are optional, but must go together
- `provider` is optional, default is OpenStreetMap.Mapnik, otherwise pick one from here: http://leaflet-extras.github.io/leaflet-providers/preview/index.html
- `coords` is the center of the map
- `zoom` is the zoom level
- `height` is the height of the map div, in pixels

Example:

```
{% include leaflet.html height="400" coords="38.731073, -9.145898" zoom="15" provider="Stamen.Watercolor" marker_coords="38.731073, -9.145898" marker_title="Here we are" %}
```
