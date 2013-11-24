Ghink
=====

Ghink is a [github pages] [1], plus [Jekyll] [7], plus [InK] [6] boilerplate. An easy way to start a beautiful, responsive, self-hosted, blog or website.

Ghink offers a quick starting point, a number of common elements and patterns used with modern websites, and some recipes to get you going.

It's currently based on versions 2.2.1 of [Ink] [6], and 1.2.1 of [Jekyll] [7].

What is InK exactly?
--------------------

[InK] [6] is a set of tools for quick development of web interfaces. It offers a fluid and responsive grid, common interface elements, interactive components, a design-first approach with ease of use and simplicity at its core. Start integrating Ink in your projects and remove the hassle of building the basics, staying free to focus on what's important.

InK provides modern responsive CSS patterns for many devices, meaning this website will work well on the desktop, smartphones or tablets.

Before you start
----------------

Before you start building your website, you need to install a few tools first.

We assume you have a Github account and are familiar with git at this point, or at leat you understand the concept of cloning, branches, pushing, pulling and committing code. If not, please take 30 minutes and read this [Guide] [2] and these [Pages] [3]

Ghink uses [Github Pages] [1], which in turn uses [Jekyll] [4], a simple, blog aware static site generator. To install Jekyll in your computer, follow these steps:

```
sudo gem update --system
sudo gem install jekyll
```

For more information on how to install Jekyll, check [this page] [5].

Jekyll uses the [Liquid templating] [8] system.

See it in action
----------------

We have a Ghink [showroom website for you][10], you can use it to check on what's possible to do. Technical documentation stays here, keep reading.

Make your own Github Page in 5 minutes
--------------------------------------

We have a step by step guide for you. [Read it here][14].

Got it. Now what?
-----------------

 - [_config.yml][11] file documentation
 - [Snippets][12] options and examples
 - How to write a [Blogpost][13]
 - See how [InK works][6].
 - How to [make your own Github Page][14]

Developing model and contributing
---------------------------------

We use the [Git flow] [9] workflow with ghink with a few nuances. Essencially we only use the develop and gh-pages branches. Day to day development goes into the develop branch of the project, which eventually merges into the gh-pages branch, our production ready releases bucket, which in turn triggers the [Ghink website] [10], thanks to the Github Pages service.

To contribute, fork this project, then pull your changes back to me. I don't have guidelines yet, so let's see how it goes.


  [1]: http://pages.github.com/                                        "Github Pages"
  [2]: https://help.github.com/articles/set-up-git                     "Set Up Git"
  [3]: https://help.github.com/categories/19/articles                  "Using Git"
  [4]: https://help.github.com/articles/using-jekyll-with-pages        "Using Jekyll with Pages"
  [5]: http://jekyllrb.com/docs/installation/                          "Jekyll Installation"
  [6]: http://ink.sapo.pt/                                             "InK - Interface Kit"
  [7]: http://jekyllrb.com/                                            "Jekyll"
  [8]: https://github.com/Shopify/liquid/wiki/Liquid-for-Designers     "Liquid templating"
  [9]: http://nvie.com/posts/a-successful-git-branching-model/         "Git flow"
  [10]: http://ghink.cc/                                     "Ghink"
  [11]: https://github.com/celso/ghink/blob/gh-pages/_docs/CONFIG.md         "_config.yml"
  [12]: https://github.com/celso/ghink/blob/gh-pages/_docs/SNIPPETS.md       "Snippets"
  [13]: https://github.com/celso/ghink/blob/gh-pages/_docs/BLOGPOST.md       "Writing a blog post"
  [14]: https://github.com/celso/ghink/blob/gh-pages/_docs/GH-PAGES-HOWTO.md  "Howto"
