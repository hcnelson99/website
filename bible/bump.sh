#!/bin/sh
sed -i '' "s/bible-app-v[0-9]*/bible-app-v$(date +%s)/" sw.js
