# Playground

The mechanisms this app is built on, each one scored live against the real
catalogue. Read a page top to bottom: every number on it was computed from your
query just now, not written down.

<ul class="pg-index">
{% for page in pages %}
<li>
{% if page.endpoint %}<a href="{{ url_for(page.endpoint) }}">{{ page.title }}</a>
{% else %}<span class="soon">{{ page.title }}</span> <em>not built yet</em>{% endif %}
<span class="pg-index-blurb">{{ page.blurb }}</span>
</li>
{% endfor %}
</ul>
