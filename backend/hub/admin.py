from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.db.models import F
from django.db.models.functions import Least
from django.shortcuts import render

from .models import CustomUser, Session


class AddTicketsForm(forms.Form):
    amount = forms.IntegerField(min_value=1, max_value=32767, label="Tickets to add per user")


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Arcade", {"fields": ("tickets", "hidden")}),)
    list_display = UserAdmin.list_display + ("tickets", "hidden")
    actions = ("add_tickets",)

    @admin.action(description="Add tickets")
    def add_tickets(self, request, queryset):
        form = AddTicketsForm(request.POST or None)
        if "amount" in request.POST and form.is_valid():
            amount = form.cleaned_data["amount"]
            queryset.update(tickets=Least(F("tickets") + amount, 32767))
            self.message_user(request, f"Added {amount} ticket(s) to {queryset.count()} user(s).")
            return None
        return render(request, "admin/hub/customuser/add_tickets.html", {
            **self.admin_site.each_context(request),
            "title": "Add tickets",
            "opts": self.model._meta,
            "form": form,
            "users": queryset,
        })


admin.site.register(Session)
