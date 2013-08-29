import re

import requests


def global_consts(request):
    last_news_id, last_news_title = cache_last_news()
    global_info = {
        'LAST_NEWS_ID': last_news_id,
        'LAST_NEWS_TITLE': last_news_title,
    }

    # show latest newes JUST ONCE!
    welcome = request.session.get('welcome')
    if welcome is None:
        request.session['welcome'] = True
    else:
        request.session['welcome'] = last_news_id

    return global_info


def cache_last_news():
    news = requests.get('http://blog.mindmup.com/feeds/posts/default?max-results=1').text
    prog = re.compile(r'<entry><id>([^<]*)<.*<title[^>]*>([^<]*)<')
    result = prog.search(news)
    last_news_id, last_news_title = result.groups()
    return last_news_id, last_news_title
