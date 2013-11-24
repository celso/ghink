How to bootstrap your Ghink website
===================================

This explains how to start your Ghink based website on [Github Pages][1] in simple steps.

In this example, we'll teach how to create a [User/Organization Github Page][3].


Create your Github Page repo
----------------------------

First off, create your own Github Page repository. It must be named `user.github.io` (where `user` is your Github username). Add a Jekyll .gitignore template to it. Like this:

![Creating new repo](https://raw.github.com/celso/ghink/gh-pages/assets/images/github_repo_create.png "Creating new repo")

Clone the repo in your disk
---------------------------

```
$ cd ~/Documents
$ git clone git@github.com:user/user.github.io.git
$ cd user.github.io
```

Download Ghink
--------------

Now [download the latest][2] version of Ghink to your local disk. Unpack it over your newly cloned repo.

```
$ cd ~/Documents/user.github.io
$ curl https://github.com/celso/ghink/archive/gh-pages.zip -L -o /tmp/ghink.zip
$ unzip /tmp/ghink.zip
$ mv ghink-gh-pages/* .
$ rm -fr ghink-gh-pages/
```

Make some changes
-----------------

Now you need to configure a few options. At this point you should ready the [_config.yml][4] options document.

Ok, let's do this, open your `_config.yml` with your favorite editor and edit these options:

```
name: "User's Github page"
url: "user.github.io"
description: "A pretty cool Ghink based website"
timezone: Europe/Lisbon
```

Remeber, change `user` to your Github username. Also, check and type your correct [timezone][6].

Delete these lines for now:

```
ga_domain: "ghink.cc"
ga_id: "UA-45360427-2"
disqus_shortname: "ghink"
```

You can add Google Analytics and Disqus comments later.

In the end your `_config.yml` should look like this:

```
name: "User's Github page"
url: "http://user.github.io/"
description: "A pretty cool Ghink based website"
use_leaflet: 1
blog_more_posts: 5
prettify_theme: "ghink"
markdown: redcarpet
pygments: true
paginate: 5
paginate_path: "blog/page/:num"
timezone: Europe/Lisbon
redcarpet:
  extensions:
    - hard_wrap
    - no_intra_emphasis
    - autolink
    - strikethrough
    - fenced_code_blocks
```

If you want to know more about Jekyll's internal options then [read this][5].

Next up, delete the `CNAME` and `VERSION` files, you won't need them.

```
$ cd ~/Documents/user.github.io
$ rm CNAME VERSION
```

The CNAME file is used with project pages with custom domains, read all [about it here][7].

Add everything, commit and push
-------------------------------

You're ready. Add everything to your repo now, then commit, then push the changes to github.

```
$ cd ~/Documents/user.github.io
$ git add *
$ git commit -m "Ghink initial commit"
$ git push
```

That's it, now head to [http://user.github.io][10] (change `user` to your Github username) and check your own copy of the Ghink's boilerplate.

Next you need to change the website to your own needs and content.

You should also install Jekyll now if you haven't yet. Remember, part of the beauty of this setup is that you can run your whole website locally with zero dependencies, offline, no webserver or other interpreters needed.

Also play with [InK][9] for a while to get used to it. You'll love it.

Start with the [README document][8] to find out how to do all of this and more.

 [1]:   http://pages.github.com/
 [2]:   https://github.com/celso/ghink/archive/gh-pages.zip
 [3]:   https://help.github.com/articles/user-organization-and-project-pages
 [4]:   https://github.com/celso/ghink/blob/gh-pages/_docs/CONFIG.md
 [5]:   http://jekyllrb.com/docs/configuration/
 [6]:   http://en.wikipedia.org/wiki/List_of_tz_database_time_zones
 [7]:   https://help.github.com/articles/setting-up-a-custom-domain-with-pages
 [8]:   https://github.com/celso/ghink/blob/gh-pages/README.md
 [9]:   http://ink.sapo.pt/
 [10]:  http://user.github.io/
