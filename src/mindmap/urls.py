from django.conf.urls import patterns, include, url
from django.views.generic.base import RedirectView

# Uncomment the next two lines to enable the admin:
# from django.contrib import admin
# admin.autodiscover()

urlpatterns = patterns('',
    # Examples:
    # url(r'^$', 'mindmap.views.home', name='home'),
    # url(r'^mindmap/', include('mindmap.foo.urls')),
    url(r'^$', RedirectView.as_view(url='/editor/'), name='index'),
    url(r'^editor/', include('mindmap.editor.urls')),

    # Uncomment the admin/doc line below to enable admin documentation:
    # url(r'^admin/doc/', include('django.contrib.admindocs.urls')),

    # Uncomment the next line to enable the admin:
    # url(r'^admin/', include(admin.site.urls)),
)
