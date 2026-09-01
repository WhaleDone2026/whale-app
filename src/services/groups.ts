import { supabase } from '@/src/lib/supabase';
import type { AppUser } from '@/src/services/users';
import { mapUserRowToAppUser } from '@/src/services/users';

type GroupMemberRow = {
  user_id: string;
  profiles: {
    id: string;
    name: string;
    tag: string;
    profile_image_url: string | null;
    description: string | null;
    installed_at: string;
    intimacy_level: number;
    whale_id: number | null;
  } | null;
};

type GroupRow = {
  id: string;
  name: string;
  group_members: GroupMemberRow[];
};

export type Group = {
  id: string;
  name: string;
  memberIds: string[];
};

export type GroupWithMembers = Group & {
  members: AppUser[];
};

export const EMPTY_GROUP: GroupWithMembers = {
  id: '',
  name: '그룹 없음',
  memberIds: [],
  members: [],
};

function mapGroupRows(data: GroupRow[]): GroupWithMembers[] {
  return data.map((group) => {
    const members = group.group_members
      .map((member) => member.profiles)
      .filter((user): user is NonNullable<GroupMemberRow['profiles']> => Boolean(user))
      .map(mapUserRowToAppUser);

    return {
      id: group.id,
      name: group.name,
      memberIds: members.map((member) => member.id),
      members,
    };
  });
}

export async function fetchGroupsWithMembersForUser(userId: string): Promise<GroupWithMembers[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .returns<Array<{ group_id: string }>>();

  if (membershipError) {
    console.warn('[groups] Failed to load group memberships', {
      code: membershipError.code,
      message: membershipError.message,
    });
    return [];
  }

  const groupIds = [...new Set((memberships ?? []).map((membership) => membership.group_id))];

  if (groupIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('groups')
    .select(
      `
      id,
      name,
      group_members (
        user_id,
        profiles (
          id,
          name,
          tag,
          profile_image_url,
          description,
          installed_at,
          intimacy_level,
          whale_id
        )
      )
    `,
    )
    .in('id', groupIds)
    .order('created_at', { ascending: true })
    .returns<GroupRow[]>();

  if (error || !data) {
    console.warn('[groups] Failed to load user groups', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return [];
  }

  return mapGroupRows(data);
}

export async function fetchGroupsWithMembers(): Promise<GroupWithMembers[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      `
      id,
      name,
      group_members (
        user_id,
        profiles (
          id,
          name,
          tag,
          profile_image_url,
          description,
          installed_at,
          intimacy_level,
          whale_id
        )
      )
    `,
    )
    .order('created_at', { ascending: true })
    .returns<GroupRow[]>();

  if (error || !data) {
    console.warn('[groups] Failed to load groups', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return [];
  }

  return data.map((group) => {
    const members = group.group_members
      .map((member) => member.profiles)
      .filter((user): user is NonNullable<GroupMemberRow['profiles']> => Boolean(user))
      .map(mapUserRowToAppUser);

    return {
      id: group.id,
      name: group.name,
      memberIds: members.map((member) => member.id),
      members,
    };
  });
}
