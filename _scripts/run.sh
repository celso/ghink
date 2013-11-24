#!/bin/sh

if [ ! -f _config.yml ]
then
  echo "Run this at the root of your jekyll project"
  exit
fi

jekyll serve --watch --baseurl '' -t
