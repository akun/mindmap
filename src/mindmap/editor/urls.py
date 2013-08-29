from django.conf.urls import patterns, url

urlpatterns = patterns('',
    url(r'^$', 'mindmap.editor.views.home', {'template': 'editor/editor.html'}, name='home'),
)
