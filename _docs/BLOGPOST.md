Writing a blog post
===================

A blog post is nothing but a simple text file in the [_posts](_posts) directory, following this notation:

```
YYYY-MM-DD-simple-and-unique-permalink-name.markdown
```

The file is divided into two parts.

First the YAML section (aka Jekyll [Front-matter] [1]):

```
---
layout: post
date: 2011-03-14 19:31:24 UTC
title: "Cute little blog post"
categories: blog
excerpt: "I\'ve escaped this excerpt so it won\'t hurt my javascript."
longexcerpt: "I\'ve escaped this excerpt so it won\'t hurt my javascript.
  And can actually have more than one line in the longexcerpt,
  which is amazing."
thumbnail: /assets/images/dummy_thumb.jpg
frontimage: /assets/images/dummy.jpg
---
```

And then the markdown/HTML section (or content of the blog post).

```
Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.

![Foz Coa Boat](/assets/images/fozcoa.jpg "Foz Coa Boat")

Great image uh?
```

Here's an [example of a post](_posts/2013-11-18-big-photos.markdown) (press the RAW button to see the source)

YAML section
------------

This section is made of **key: value** pairs, one per line. Here's the list we use:

<table>
    <tr>
        <td>key</td>
        <td>value</td>
        <td><em>observations</em></td>
    </tr>
    <tr>
        <td><b>layout</b></td>
        <td>post</td>
        <td>always use the <em>post</em> layout for blog posts</td>
    </tr>
    <tr>
        <td><b>date</b></td>
        <td>YYYY-MM-DD HH:MM:SS UTC</td>
        <td>date of the post, 24 hour format, with leading zeros</td>
    </tr>
    <tr>
        <td><b>title</b></td>
        <td>"Jekyll\'s escaped title"</td>
        <td>JSON escaped post title</td>
    </tr>
    <tr>
        <td><b>categories</b></td>
        <td>technology<br/>nature<br/>cars<br/>whatever</td>
        <td>list of space separated categories.</td>
    </tr>
    <tr>
        <td><b>excerpt</b></td>
        <td>"Post\'s first paragraph"</td>
        <td>An excerpt of the post. Short paragraph</td>
    </tr>
    <tr>
        <td><b>longexcerpt</b></td>
        <td>"Post\'s first two paragraphs"</td>
        <td>A longer excerpt of the post. Two paragraphs is ok</td>
    </tr>
    <tr>
        <td><b>thumbnail</b></td>
        <td>/assets/images/post_thumb.jpg</td>
        <td>(optional) Thumbnail image path. Used for search results and recommendations.</td>
    </tr>
    <tr>
        <td><b>frontimage</b></td>
        <td>/assets/images/post.jpg</td>
        <td>(optional) Big image, representative of the content, path. Used in listings and headlines.</td>
    </tr>
</table>

Notes:

 * The string values must be JSON escaped. " and ' should become \" and \'
 * The order of the keys is irrelevant

Markdown/HTML section
---------------------

This is the body of the blog post. You can use both pure HTML or [Markdown] [3], we're using the [Redcarpet] [4] parser.

If possible, always use Markdown. See the [Markdown Cheatsheet][6] page for help.

You can and should our [snippets][5] to display videos, maps, etc. They simplify your life and come with appropriate CSS styles. [See here][5] for the list of supported snippets.

Notes:

 * If you use HTML do not use any other custom classes with it, just pure non styled HTML.
 * Images should be local. Do not reference images from flickr or external services.
 * Do not specify the height and width of an image. Just use img src="..." (see 1)
 * Normal post images should be hosted at [assets/images/](assets/images/) with width 1024px
 * Thumbnail images should be hosted at [assets/images/](assets/images/) width width 270px
 * In images and local assets, always use relative links starting with / (ie: /assets/images/post.jpg), never absolute.
 * Use the JPG format for live photos, the file size is much smaller without compromising quality. PNGs are fine for logos, comics, text, etc.

To write code on a page or post, use the following markdown syntax:

> &#96;&#96;&#96;  
> var code = 42;  
> &#96;&#96;&#96;  

Here's a [boilerplate][7] to start a new post.

[back to main](README.md)

  [1]: http://jekyllrb.com/docs/frontmatter/
  [2]: https://help.github.com/articles/github-flavored-markdown
  [3]: http://daringfireball.net/projects/markdown/
  [4]: https://github.com/vmg/Redcarpet
  [5]: https://github.com/celso/ghink/blob/gh-pages/_docs/SNIPPETS.md
  [6]: https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet
  [7]: https://raw.github.com/celso/ghink/gh-pages/_examples/2013-10-31-template-post.markdown

