from django.core.urlresolvers import reverse
from django.test import TestCase


class EditorTestCase(TestCase):

    def test_home_200(self):
        response = self.client.post(reverse('home'))
        self.assertEqual(response.status_code, 200)
