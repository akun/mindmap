from django.template.response import TemplateResponse


def home(request, template):

    return TemplateResponse(request, template, {})
